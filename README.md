# Devvit Post Summarizer

AI-powered post summarization for Reddit. Automatically summarizes posts when they reach 75 comments using OpenRouter AI.

## Features

- 📊 **Auto-trigger**: Summarizes posts at 75 comments automatically
- 🇮🇹 **Italian language**: Optimized for r/ItaliaCareerAdvice
- 📌 **Pinned summaries**: Posts summaries as distinguished mod comments
- 🔧 **Manual trigger**: Moderators can force summarization anytime
- 🔑 **Per-subreddit config**: Each subreddit manages its own API key
- ⚡ **Smart deduplication**: Only summarizes each post once

## Installation

### 1. Prerequisites

- Node.js 18+
- Reddit app with Devvit enabled
- OpenRouter API key ([Get free key](https://openrouter.ai/))

### 2. Create the App

Install the Devvit CLI:

```bash
npm install -g @devvit/public-api
```

Create a new app:

```bash
devvit new
```

Or clone this project to your Devvit apps directory.

### 3. Configure API Key

You have two options:

**Option A: Via Menu Item**
1. On any post in your subreddit, click "⋮" → "Summarize Post"
2. The bot will reply with setup instructions
3. Reply with `!setup-key YOUR_OPENROUTER_API_KEY`
4. Your comment will be deleted to protect the key

**Option B: Via Redis (Advanced)**
```bash
# If you have Redis CLI access
redis-cli
> SET subreddit:YOUR_SUBREDDIT:openrouter_key "sk-or-v1-..."
> EXIT
```

## Usage

### Automatic Summarization

Once configured, the app works automatically:

1. New comments are counted in Redis
2. When a post reaches 75 comments, summarization triggers
3. OpenRouter API generates a summary in Italian
4. Summary is posted as a distinguished, pinned comment

### Manual Trigger

To force a summary at any time:

1. Navigate to any post
2. Click "⋮" menu (three dots)
3. Select "Summarize Post"
4. Bot will generate and post the summary

## Configuration

### Redis Keys

- `post:{postId}:commentCount` - Comment count (TTL: 7 days)
- `post:{postId}:summarized` - Summarization flag (TTL: 7 days)
- `subreddit:{subreddit}:openrouter_key` - API key (no TTL)

### Triggers

- `OnCommentSubmit` - Increment counter, check threshold
- `/internal/comment-handler` - Internal trigger endpoint

### Menu Item

- **Summarize Post** (Post menu, moderators only)
  - Manual trigger for immediate summarization
  - Shows setup prompt if API key not configured

## Development

### Project Structure

```
devvit-summarizer/
├── devvit.json                 # Devvit config
├── src/
│   ├── server/
│   │   ├── index.js           # Main entry point (triggers, menu, endpoints)
│   │   ├── commentHandler.js  # Comment counting & summarization logic
│   │   ├── summarizer.js      # OpenRouter AI integration
│   │   └── redditClient.js    # Reddit API helpers
│   └── shared/
│       └── prompts.js         # AI prompts
└── README.md
```

### Running Locally

```bash
# Install dependencies
npm install

# Start Devvit dev server
devvit start

# Test triggers in your dev subreddit
```

### Testing

To test the trigger flow:

1. Create a test post in your dev subreddit
2. Add 75 comments manually or via script
3. Watch for summarization trigger in logs
4. Verify the summary is posted and pinned

To test manual trigger:

1. Click "Summarize Post" menu item on any post
2. Verify summary is generated and posted

### Logging

The app logs extensively:

```javascript
console.log(`Post ${postId} now has ${count} comments`);
console.log(`Generating summary for post ${postId}...`);
console.log(`Summary comment posted: ${comment.id}`);
```

Check the Devvit console for real-time logs.

## Customization

### Change Comment Threshold

Edit `src/server/commentHandler.js`:

```javascript
// Line ~165
if (count >= 75) {  // Change 75 to your desired threshold
```

### Change AI Model

Edit `src/server/summarizer.js`:

```javascript
// Line ~38
model: 'nvidia/nemotron-3-super-120b-a12b:free',  // Change to preferred model
```

See [OpenRouter models](https://openrouter.ai/models) for options.

### Customize Summary Prompt

Edit `src/shared/prompts.js`:

```javascript
const SUMMARY_PROMPT = `Your custom prompt here...`;
```

### Change Summary Language

Edit the prompt to match your subreddit's primary language:

```javascript
// For English subreddits:
const SUMMARY_PROMPT = `...Write in English.`;

// For Spanish subreddits:
const SUMMARY_PROMPT = `...Escribe en español.`;
```

## Troubleshooting

### Summarization not triggering

1. Check API key is configured
2. Verify Redis keys exist: `post:{postId}:commentCount`
3. Check logs for errors
4. Ensure post hasn't already been summarized (`post:{postId}:summarized`)

### API key errors

```bash
# Verify key format
redis-cli
> GET subreddit:YOUR_SUBREDDIT:openrouter_key
# Should start with "sk-or-"
```

### Comment not posting/pinning

1. Check bot has moderator permissions
2. Verify `distinguish` is working
3. Check Reddit API rate limits

### Redis connection issues

Ensure Redis is accessible:
```bash
redis-cli ping
# Should return PONG
```

## Security

- API keys stored in Redis (encrypted at rest in production)
- Setup comments automatically deleted to protect keys
- Only moderators can configure API keys
- No keys logged or exposed in error messages

## Cost

OpenRouter model `nvidia/nemotron-3-super-120b-a12b:free` is **free**.

If you switch to a paid model, costs depend on:
- Number of summaries generated
- Comment length (token count)
- Model pricing

Estimate: ~500-1000 tokens per summary × your model's per-token price.

## License

MIT

## Contributing

Feel free to fork, modify, and improve this for your community!

## Support

- Devvit Docs: https://developers.reddit.com/
- OpenRouter Docs: https://openrouter.ai/docs
- Reddit: r/ItaliaCareerAdvice

---

Built with ❤️ for r/ItaliaCareerAdvice
