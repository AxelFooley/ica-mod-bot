import { Devvit, TriggerContext } from '@devvit/public-api';
import { log, buildCommentTexts } from './helpers.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

const COMMENT_THRESHOLD = 25;
const MAX_COMMENTS_FOR_SUMMARY = 50;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

type SummaryResult = 'already_done' | 'no_api_key' | 'api_error' | 'success';

// ---------------------------------------------------------------------------
// Core summarisation logic — runs inside the Devvit Blocks runtime where
// context.redis / context.reddit / context.settings are fully initialised.
// ---------------------------------------------------------------------------

async function performSummary(
  postId: string,
  context: TriggerContext | Devvit.Context,
  force = false,
): Promise<SummaryResult> {
  const redisKey = `summarized:${postId}`;
  const lockKey = `lock:summarized:${postId}`;

  if (!force) {
    const alreadyDone = await context.redis.get(redisKey);
    if (alreadyDone) return 'already_done';

    // Atomic set-if-not-exists — only one invocation proceeds past this point
    const lockAcquired = await context.redis.set(lockKey, '1', {
      nx: true,
      expiration: new Date(Date.now() + 120_000), // 120s covers worst-case retries
    });
    if (lockAcquired === null) return 'already_done';
  }

  let succeeded = false;
  try {
    const post = await context.reddit.getPostById(postId);

    const comments = await context.reddit
      .getComments({ postId, sort: 'top', pageSize: MAX_COMMENTS_FOR_SUMMARY })
      .all();

    const commentTexts = buildCommentTexts(comments.slice(0, MAX_COMMENTS_FOR_SUMMARY));

    const systemInstruction = `Sei un bot che riassume discussioni Reddit in italiano.

REGOLE ASSOLUTE — non derogabili:
- NON scrivere saluti, presentazioni o frasi introduttive (niente "Ciao a tutti", niente "Come moderatore", niente contesto sul post).
- NON scrivere conclusioni o auguri finali (niente "Spero che...", niente "Continuate a...", niente ringraziamenti).
- Inizia DIRETTAMENTE con i bullet point. Nient'altro prima.
- Ogni bullet point deve essere conciso (max 2 righe).
- Usa il formato: "* **Tema**: descrizione"
- Sii neutrale e oggettivo.`;

    const userContent = `Titolo del post: "${post.title}"

Commenti da riassumere:
${commentTexts}`;

    const apiKey = await context.settings.get('gemini-api-key');
    if (!apiKey) {
      log('error', 'No Gemini API key configured');
      return 'no_api_key';
    }

    const MAX_RETRIES = 2;
    let summary: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000 * attempt));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await fetch(GEMINI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey as string,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: userContent }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          log('error', 'Gemini API error', { status: response.status, body: errorText });
          if (response.status >= 400 && response.status < 500) {
            return 'api_error'; // 4xx: do not retry
          }
          continue; // 5xx: allow retry
        }

        const data = await response.json();
        const candidate: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidate || candidate.trim().length < 10) {
          log('error', 'No usable summary from Gemini', { data: JSON.stringify(data) });
          return 'api_error';
        }

        summary = candidate;
        break;
      } catch (err) {
        log('error', 'Gemini fetch failed', { attempt, err: String(err) });
        if (attempt === MAX_RETRIES) return 'api_error';
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!summary) return 'api_error';

    const botComment = await context.reddit.submitComment({
      id: postId,
      text: `**[TL;DR]** Questo post ha raggiunto ${COMMENT_THRESHOLD}+ commenti. Ecco un riassunto generato dall'IA della discussione:\n\nEcco i punti chiave della conversazione:\n\n${summary}\n\n---\n*^(Riassunto generato automaticamente. Potrebbe non catturare tutte le sfumature della discussione.)*`,
    });

    await botComment.distinguish(true);

    // Set permanent dedup key only after confirmed success
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await context.redis.set(redisKey, '1', { expiration: thirtyDaysFromNow });

    succeeded = true;
    return 'success';
  } finally {
    if (!force && !succeeded) {
      // Release lock so the next CommentCreate event can retry
      await context.redis.del(lockKey).catch(() => {});
    }
  }
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
// Trigger — post deleted, clean up Redis keys
// ---------------------------------------------------------------------------

Devvit.addTrigger({
  event: 'PostDelete',
  onEvent: async (event, context) => {
    if (event.postId) {
      await Promise.all([
        context.redis.del(`summarized:${event.postId}`),
        context.redis.del(`lock:summarized:${event.postId}`),
      ]);
      log('info', 'Cleaned up Redis keys for deleted post', { postId: event.postId });
    }
  },
});

export default Devvit;
