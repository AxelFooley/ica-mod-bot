# Project Structure

```
devvit-summarizer/
├── devvit.json                 # Devvit app configuration
├── package.json                # Node.js dependencies
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore patterns
├── LICENSE                     # MIT license
├── README.md                   # Full documentation
├── PROJECT_SUMMARY.md          # This file
└── src/
    ├── server/
    │   ├── index.js            # Main entry: triggers, menu, endpoints
    │   ├── commentHandler.js   # Comment counting & summarization logic
    │   ├── summarizer.js       # OpenRouter AI integration
    │   └── redditClient.js     # Reddit API helpers
    └── shared/
        └── prompts.js          # AI prompts
```

## File Purposes

### Configuration
- **devvit.json**: Devvit app manifest, permissions, triggers, menu items
- **package.json**: Node.js dependencies and scripts
- **.env.example**: Template for environment variables
- **.gitignore**: Files to exclude from version control
- **LICENSE**: MIT license

### Core Application
- **src/server/index.js**:
  - `OnCommentSubmit` trigger handler
  - "Summarize Post" menu item handler
  - `!setup-key` command handler for API key configuration
  - `/health` HTTP endpoint

- **src/server/commentHandler.js**:
  - Redis operations for comment counting
  - Summarization flag management
  - API key storage/retrieval
  - Main logic: `handleNewComment()`, `checkAndSummarize()`

- **src/server/summarizer.js**:
  - OpenRouter API integration
  - Summary generation with structured prompts
  - Error handling and response parsing

- **src/server/redditClient.js**:
  - Devvit Reddit API wrappers
  - Post fetching (`getPost`)
  - Comment fetching (`getComments`)
  - Comment submission (`postComment`)
  - Comment pinning (`pinComment`)

- **src/shared/prompts.js**:
  - System prompt for AI summarization
  - Italian language instructions
  - Structured output format

## Key Features Implemented

### ✅ Comment Tracking
- Redis-based counter with 7-day TTL
- Key pattern: `post:{postId}:commentCount`
- Automatic increment on each new comment

### ✅ Summarization Trigger
- Auto-trigger at 75 comments
- Manual trigger via menu item
- Deduplication with `post:{postId}:summarized` flag

### ✅ AI Integration
- OpenRouter API with OpenAI-compatible format
- Model: `nvidia/nemotron-3-super-120b-a12b:free`
- Structured summaries (Context, Key Points, Community Advice)
- Italian language output

### ✅ API Key Management
- Per-subreddit configuration via Redis
- Setup via menu item + comment command (`!setup-key`)
- Moderator-only access
- Secure comment deletion after setup

### ✅ Comment Posting
- Summary posted as distinguished comment
- Auto-pinned via `distinguish(true)`
- Metadata footer with comment count

## Redis Schema

| Key Pattern | Purpose | TTL |
|------------|---------|-----|
| `post:{postId}:commentCount` | Comment counter | 7 days |
| `post:{postId}:summarized` | Summarization flag | 7 days |
| `subreddit:{subreddit}:openrouter_key` | API key | Permanent |

## API Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/internal/comment-handler` | POST | Comment submit trigger |
| `/health` | GET | Health check |

## Menu Items

| Name | Location | User Type | Purpose |
|------|----------|-----------|---------|
| Summarize Post | Post menu | Moderator | Manual summary trigger |

## Setup Instructions

### For Developers

```bash
# Install dependencies
npm install

# Start dev server
devvit start

# Build for production
devvit build

# Deploy
devvit deploy
```

### For Moderators

1. Use "Summarize Post" menu item on any post
2. If API key not configured, follow setup instructions
3. Reply with `!setup-key YOUR_API_KEY`
4. Auto-summarization enabled automatically

## Dependencies

```json
{
  "@devvit/public-api": "^0.10.0"
}
```

## Next Steps

1. Test in dev subreddit
2. Monitor Redis keys and API calls
3. Adjust comment threshold if needed
4. Customize prompt for different languages
5. Add error logging/monitoring

---

Built for r/ItaliaCareerAdvice 🇮🇹
