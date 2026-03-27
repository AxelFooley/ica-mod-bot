import { Devvit } from '@devvit/public-api';
import type { TriggerContext } from '@devvit/public-api';

const COMMENT_THRESHOLD = 75;
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

  // Claim the job before any async work to prevent races
  await context.redis.set(redisKey, '1');

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

  const prompt = `Sei un bot moderatore di Reddit per il subreddit r/italiacareeradvice. Il post intitolato "${post.title}" ha raggiunto molti commenti e devi riassumere la discussione in italiano.

Riassumi i temi principali, le opinioni più comuni, e i punti più interessanti. Sii neutrale, conciso e utile. Formatta l'output con una breve frase introduttiva, poi bullet point con i punti principali.

Titolo del post: "${post.title}"

Commenti principali:
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
    text: `**[TL;DR]** *Questo post ha raggiunto ${COMMENT_THRESHOLD}+ commenti. Ecco un riassunto generato dall'IA della discussione:*\n\n${summary}\n\n---\n*^(Questo riassunto è stato generato automaticamente da un bot. Potrebbe non catturare tutte le sfumature della discussione.)*`,
  });

  await botComment.distinguish(true);

  return 'success';
}

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
