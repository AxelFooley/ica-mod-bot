/**
 * Devvit "Faro" Post Summarizer
 * Uses @devvit/public-api SDK
 */

import { Devvit } from "@devvit/public-api";

// Trigger: when a comment is submitted
Devvit.addTrigger({
  on: "CommentSubmit",
  async handler(event, context) {
    console.log(`[Faro] Comment submitted: ${event.comment?.id}`);
    try {
      const { handleNewComment } = await import("./commentHandler.js");
      await handleNewComment(event, { reddit: context.reddit, redis: context.redis });
    } catch (e) {
      console.error(`[Faro] Comment handler error: ${e}`);
    }
  },
});

// Menu item: manual summarize
Devvit.addMenuItem({
  label: "Summarize Post",
  location: "post",
  forUserType: "moderator",
  async onPress(event) {
    const postId = event.postId;
    const redis = event.redis;
    const reddit = event.reddit;

    console.log(`[Faro] Menu summarize for post ${postId}`);

    try {
      // Get subreddit from the post's subreddit
      const post = await reddit.getPostById(postId);
      const subreddit = post.subredditName;

      // Check API key
      const { getOpenRouterKey } = await import("./commentHandler.js");
      const apiKey = await getOpenRouterKey({ redis }, subreddit);

      if (!apiKey) {
        const reply = await reddit.submitComment({
          postId,
          text: `⚠️ **OpenRouter API Key Required**

No API key is configured for r/${subreddit}. 

To configure, the moderator should run:
\`!setup-key YOUR_OPENROUTER_API_KEY\`

Get a free key at https://openrouter.ai/`,
        });
        return;
      }

      // Run summarization
      const { checkAndSummarize } = await import("./commentHandler.js");
      await checkAndSummarize({ reddit, redis }, postId, subreddit);

      // Confirm success
      await reddit.submitComment({
        postId,
        text: `✅ **Summary generation started**

This may take up to 30 seconds. The AI summary will be posted as a pinned mod comment.`,
      });
    } catch (e) {
      console.error(`[Faro] Menu error: ${e}`);
      try {
        await reddit.submitComment({
          postId,
          text: `❌ Error: ${String(e)}`,
        });
      } catch {}
    }
  },
});

export default Devvit;
