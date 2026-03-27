import { Devvit } from '@devvit/public-api';
import type { TriggerContext } from '@devvit/public-api';

const COMMENT_THRESHOLD = 5; // TODO: restore to 75 before production deploy
const MAX_COMMENTS_FOR_SUMMARY = 50;
const GEMINI_MODEL = 'gemini-2.5-flash';
// Native Gemini REST API — stable and globally allowlisted by Devvit
const GEMINI_URL = (apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

Devvit.addSettings([
  {
    name: 'gemini-api-key',
    label: 'Gemini API Key',
    type: 'string',
    scope: 'installation',
    helpText: 'Your Google Gemini API key (from aistudio.google.com/apikey)',
  },
]);

// Shared summarization logic used by both the trigger and the menu item.
// `force` skips the Redis idempotency guard (used for manual mod triggers).
async function performSummary(
  postId: string,
  context: Pick<TriggerContext, 'reddit' | 'redis' | 'settings'>,
  force = false,
): Promise<'already_done' | 'no_api_key' | 'api_error' | 'success'> {
  const redisKey = `summarized:${postId}`;

  if (!force) {
    const alreadyDone = await context.redis.get(redisKey);
    if (alreadyDone) return 'already_done';
  }

  // Claim the job before any async work to prevent races.
  // TTL of 30 days keeps us within Reddit's data-retention policy.
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await context.redis.set(redisKey, '1', { expiration: thirtyDaysFromNow });

  // Fetch the full Post model for title
  const post = await context.reddit.getPostById(postId);

  // Fetch top comments
  const comments = await context.reddit.getComments({
    postId,
    sort: 'top',
    pageSize: MAX_COMMENTS_FOR_SUMMARY,
  }).all();

  const commentTexts = comments
    .slice(0, MAX_COMMENTS_FOR_SUMMARY)
    .filter((c) => c.body && c.body.trim().length > 0)
    .map((c, i) => `Commento ${i + 1} (${c.score} upvote):\n${c.body.trim()}`)
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

// Deletion trigger: clean up Redis when a post is deleted (required by Devvit Rules)
Devvit.addTrigger({
  event: 'PostDelete',
  async onEvent(event, context) {
    const postId = event.postId;
    if (!postId) return;
    await context.redis.del(`summarized:${postId}`);
    console.log(`Cleaned up Redis key for deleted post ${postId}`);
  },
});

// Automatic trigger: fires on every new comment
Devvit.addTrigger({
  event: 'CommentCreate',
  async onEvent(event, context) {
    const postId = event.comment?.postId;
    if (!postId) return;

    // Quick bail using event payload before making any API calls
    if ((event.post?.numComments ?? 0) < COMMENT_THRESHOLD) return;

    // Authoritative check with fresh data from the API
    const post = await context.reddit.getPostById(postId);
    if (post.numberOfComments < COMMENT_THRESHOLD) return;

    await performSummary(postId, context);
  },
});

// Manual trigger: mod-only post menu item for testing
Devvit.addMenuItem({
  label: 'Summarise this post',
  location: 'post',
  forUserType: 'moderator',
  async onPress(event, context) {
    const postId = event.targetId;

    context.ui.showToast('Generating summary, please wait...');

    // force=true bypasses the Redis guard so mods can re-trigger at any time
    const result = await performSummary(postId, context, true);

    if (result === 'already_done') {
      context.ui.showToast('Already summarized (this should not appear in forced mode).');
    } else if (result === 'no_api_key') {
      context.ui.showToast('Error: Gemini API key not configured.');
    } else if (result === 'api_error') {
      context.ui.showToast('Error calling the AI API. Check the logs.');
    } else {
      context.ui.showToast('Summary posted successfully!');
    }
  },
});

export default Devvit;
