import { Devvit, TriggerContext } from '@devvit/public-api';

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

const COMMENT_THRESHOLD = 25;
const MAX_COMMENTS_FOR_SUMMARY = 50;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = (apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

// ---------------------------------------------------------------------------
// Core summarisation logic — runs inside the Devvit Blocks runtime where
// context.redis / context.reddit / context.settings are fully initialised.
// ---------------------------------------------------------------------------

async function performSummary(
  postId: string,
  context: TriggerContext | Devvit.Context,
  force = false,
): Promise<'already_done' | 'no_api_key' | 'api_error' | 'success'> {
  const redisKey = `summarized:${postId}`;

  if (!force) {
    const alreadyDone = await context.redis.get(redisKey);
    if (alreadyDone) return 'already_done';
  }

  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await context.redis.set(redisKey, '1', { expiration: thirtyDaysFromNow });

  const post = await context.reddit.getPostById(postId);

  const comments = await context.reddit
    .getComments({ postId, sort: 'top', pageSize: MAX_COMMENTS_FOR_SUMMARY })
    .all();

  const commentTexts = comments
    .slice(0, MAX_COMMENTS_FOR_SUMMARY)
    .filter((c) => c.body && c.body.trim().length > 0)
    .map((c, i) => `Commento ${i + 1} (${c.score} upvote):\n${c.body!.trim()}`)
    .join('\n\n---\n\n');

  const prompt = `Sei un bot che riassume discussioni Reddit in italiano.

REGOLE ASSOLUTE — non derogabili:
- NON scrivere saluti, presentazioni o frasi introduttive (niente "Ciao a tutti", niente "Come moderatore", niente contesto sul post).
- NON scrivere conclusioni o auguri finali (niente "Spero che...", niente "Continuate a...", niente ringraziamenti).
- Inizia DIRETTAMENTE con i bullet point. Nient'altro prima.
- Ogni bullet point deve essere conciso (max 2 righe).
- Usa il formato: "* **Tema**: descrizione"
- Sii neutrale e oggettivo.

Titolo del post: "${post.title}"

Commenti da riassumere:
${commentTexts}`;

  const apiKey = await context.settings.get('gemini-api-key');
  if (!apiKey) {
    console.error('No Gemini API key configured');
    return 'no_api_key';
  }

  let summary: string;
  try {
    const response = await fetch(GEMINI_URL(apiKey as string), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Gemini API error: ${response.status} ${response.statusText} — ${errorText}`);
      return 'api_error';
    }

    const data = await response.json();
    summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summary) {
      console.error('No summary returned from Gemini:', JSON.stringify(data));
      return 'api_error';
    }
  } catch (err) {
    console.error('Failed to call Gemini API:', err);
    return 'api_error';
  }

  const botComment = await context.reddit.submitComment({
    id: postId,
    text: `**[TL;DR]** Questo post ha raggiunto ${COMMENT_THRESHOLD}+ commenti. Ecco un riassunto generato dall'IA della discussione:\n\nEcco i punti chiave della conversazione:\n\n${summary}\n\n---\n*^(Riassunto generato automaticamente. Potrebbe non catturare tutte le sfumature della discussione.)*`,
  });

  await botComment.distinguish(true);
  return 'success';
}

// ---------------------------------------------------------------------------
// Menu item — mod manually triggers summary
// ---------------------------------------------------------------------------

Devvit.addMenuItem({
  label: 'Summarise this post',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    const postId = event.targetId;
    if (!postId) return;

    const result = await performSummary(postId, context, true);

    if (result === 'no_api_key') {
      context.ui.showToast('Errore: API key Gemini non configurata.');
    } else if (result === 'api_error') {
      context.ui.showToast('Errore nella chiamata AI. Controlla i log.');
    } else {
      context.ui.showToast('Riassunto pubblicato con successo!');
    }
  },
});

// ---------------------------------------------------------------------------
// Trigger — new comment, check threshold and summarise
// ---------------------------------------------------------------------------

Devvit.addTrigger({
  event: 'CommentCreate',
  onEvent: async (event, context) => {
    const postId = event.comment?.postId;
    if (!postId) return;

    // Fast pre-check from event payload (avoids an extra API call if clearly below threshold)
    if ((event.post?.numComments ?? 0) < COMMENT_THRESHOLD) return;

    // Authoritative check with a fresh fetch
    const post = await context.reddit.getPostById(postId);
    if (post.numberOfComments < COMMENT_THRESHOLD) return;

    await performSummary(postId, context);
  },
});

// ---------------------------------------------------------------------------
// Trigger — post deleted, clean up Redis key
// ---------------------------------------------------------------------------

Devvit.addTrigger({
  event: 'PostDelete',
  onEvent: async (event, context) => {
    if (event.postId) {
      await context.redis.del(`summarized:${event.postId}`);
      console.log(`Cleaned up Redis key for deleted post ${event.postId}`);
    }
  },
});

export default Devvit;
