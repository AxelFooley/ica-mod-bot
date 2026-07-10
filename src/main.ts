import { Devvit, TriggerContext } from '@devvit/public-api';
import { log, buildCommentTexts, currentMilestone, SUMMARY_INTERVAL } from './helpers.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

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
  milestone: number,
  force = false,
): Promise<SummaryResult> {
  const milestoneKey = `lastMilestone:${postId}`;
  const commentIdKey = `summaryCommentId:${postId}`;
  const lockKey = `lock:${postId}`;

  if (!force) {
    const lastMilestoneRaw = await context.redis.get(milestoneKey);
    const lastMilestone = lastMilestoneRaw ? Number(lastMilestoneRaw) : 0;
    if (milestone <= lastMilestone) return 'already_done';

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

    const comments = await context.reddit.getComments({ postId, sort: 'top' }).all();

    const commentTexts = buildCommentTexts(comments);

    const systemInstruction = `Sei un utente esperto della community che racconta a un amico com'è andata una discussione su Reddit, in italiano.

REGOLE:
- Scrivi in prosa scorrevole, 2-4 brevi paragrafi. NIENTE elenchi puntati, NIENTE titoli in grassetto per ogni punto.
- Tono casual e colloquiale, come una chiacchierata tra amici — evita linguaggio burocratico o da comunicato stampa.
- NON scrivere saluti o presentazioni (niente "Ciao a tutti", niente "Come moderatore"). Vai dritto al racconto.
- NON scrivere conclusioni tipo "Spero sia utile" o ringraziamenti finali.
- Copri i temi principali emersi, le opinioni più condivise e gli eventuali disaccordi interessanti.
- Sii neutrale sui contenuti (non prendere posizione), ma resta informale nel modo di scrivere.`;

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

    const commentBody = `**[TL;DR]** ${summary}\n\n---\n*^(Riassunto generato dall'IA e aggiornato automaticamente man mano che la discussione cresce — copre ${comments.length} commenti finora.)*`;

    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const existingCommentId = await context.redis.get(commentIdKey);

    let editedExisting = false;
    if (existingCommentId) {
      try {
        const existingComment = await context.reddit.getCommentById(existingCommentId);
        await existingComment.edit({ text: commentBody });
        editedExisting = true;
      } catch (err) {
        // Comment was likely removed/deleted since — fall back to posting a fresh one.
        log('warn', 'Failed to edit existing summary comment, posting a new one', {
          postId,
          existingCommentId,
          err: String(err),
        });
      }
    }

    if (!editedExisting) {
      const botComment = await context.reddit.submitComment({ id: postId, text: commentBody });
      await botComment.distinguish(true);
      await context.redis.set(commentIdKey, botComment.id, { expiration: thirtyDaysFromNow });
    }

    // Set dedup key only after confirmed success
    await context.redis.set(milestoneKey, String(milestone), { expiration: thirtyDaysFromNow });

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

    const post = await context.reddit.getPostById(postId);
    const milestone = currentMilestone(post.numberOfComments);
    const result = await performSummary(postId, context, milestone, true);

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

    // Fast pre-check from event payload (avoids an extra API call if clearly below the first milestone)
    if ((event.post?.numComments ?? 0) < SUMMARY_INTERVAL) return;

    // Authoritative check with a fresh fetch
    const post = await context.reddit.getPostById(postId);
    const milestone = currentMilestone(post.numberOfComments);
    if (milestone < SUMMARY_INTERVAL) return;

    await performSummary(postId, context, milestone);
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
        context.redis.del(`lastMilestone:${event.postId}`),
        context.redis.del(`summaryCommentId:${event.postId}`),
        context.redis.del(`lock:${event.postId}`),
      ]);
      log('info', 'Cleaned up Redis keys for deleted post', { postId: event.postId });
    }
  },
});

export default Devvit;
