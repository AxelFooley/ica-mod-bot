# ica-mod-bot

AI-powered post summarizer for Reddit, built with [Devvit](https://developers.reddit.com/). Automatically (re)summarizes posts every 25 comments using Google Gemini, in a casual, conversational tone.

## Features

- **Repeating auto-trigger**: Summarizes posts at every 25-comment milestone (25, 50, 75, 100, …)
- **Italian language, casual tone**: Written like a friend recapping the thread, not a bulleted report — optimized for r/ItaliaCareerAdvice
- **Single updating comment**: Each new milestone edits the same distinguished, stickied comment instead of posting a new one — no thread spam
- **Whole-thread coverage**: No cap on how many comments are fed to the summary — it covers the entire discussion, however large
- **Manual trigger**: Moderators can force a refresh via the post menu at any time
- **Per-subreddit config**: Each subreddit manages its own Gemini API key
- **Deduplication**: A given milestone is only ever summarized once (atomic Redis lock)

## Prerequisites

- Node.js 18+
- A Google Gemini API key ([Get one free at aistudio.google.com](https://aistudio.google.com/apikey))
- Devvit CLI installed

## Setup

### 1. Install the Devvit CLI

```bash
npm install -g @devvit/cli
```

The CLI binary is `devvit-cli`. All `npm run` scripts in this project already call `devvit-cli` internally.

### 2. Install dependencies

```bash
npm install
```

### 3. Log in to Devvit

```bash
devvit-cli login
```

### 4. Configure your Gemini API key

After installing the app to your subreddit, go to the subreddit's app settings and enter your Gemini API key in the **Gemini API Key** field.

### 5. Upload the app (development)

```bash
npm run upload
```

### 6. Publish the app (production)

```bash
npm run publish
```

## Development

### Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Devvit playtest (hot reload to dev subreddit) |
| `npm run upload` | Upload new version |
| `npm run publish` | Publish to the Devvit App Directory |
| `npm run build` | Build only (no upload) |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run format` | Prettier format |
| `npm run format:check` | Prettier check (used in CI) |
| `npm run test` | Run Vitest unit tests |

### Project structure

```
ica-mod-bot/
├── src/
│   ├── main.ts              # App entry point — triggers, menu item, Devvit config
│   ├── helpers.ts           # Pure helper functions (log, comment filtering)
│   └── __tests__/
│       └── helpers.test.ts  # Vitest unit tests
├── .github/workflows/
│   ├── ci.yml               # Branch push pipeline (lint → test → upload)
│   └── publish.yml          # Main branch pipeline (lint → test → publish)
├── devvit.json              # Devvit app manifest and permissions
├── devvit.yaml              # App metadata
├── eslint.config.mjs        # ESLint flat config
├── .prettierrc.json         # Prettier config
└── vitest.config.ts         # Vitest config
```

### Key constants

| Constant | Location | Value | Description |
|----------|----------|-------|-------------|
| `SUMMARY_INTERVAL` | `src/helpers.ts` | `25` | Comment interval that triggers a (re)summary — 25, 50, 75, … |
| `GEMINI_MODEL` | `src/main.ts` | `gemini-2.5-flash` | Gemini model used for summarization |

There is no cap on how many comments are fetched or sent to Gemini — the whole thread is summarized every time.

### Redis keys

| Key | TTL | Description |
|-----|-----|-------------|
| `lastMilestone:{postId}` | 30 days | Highest comment milestone already summarized |
| `summaryCommentId:{postId}` | 30 days | Id of the bot's summary comment, so later milestones edit it in place |
| `lock:{postId}` | 120 seconds | Short-lived atomic lock to prevent race conditions |

## CI/CD

### Pipeline overview

**Every branch push** (except `main`):
1. Format check → Lint → Typecheck → Test
2. If all pass: `devvit-cli upload`

**Merge to `main`**:
1. Format check → Lint → Typecheck → Test
2. If all pass: `devvit-cli publish`

Pull requests run the quality gate only (no upload — forks don't have secret access).

### Required GitHub secret

Add a secret named `DEVVIT_TOKEN` to the repository:

1. On a logged-in developer machine, copy the token:
   ```bash
   cat ~/.devvit/token
   ```
2. Go to **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**
3. Name: `DEVVIT_TOKEN`, value: paste the full JSON content from step 1

The CI jobs pass this value as the `DEVVIT_AUTH_TOKEN` environment variable, which the Devvit CLI reads directly — no file system write needed.

## Customization

### Change the milestone interval

Edit `SUMMARY_INTERVAL` in `src/helpers.ts`:

```typescript
export const SUMMARY_INTERVAL = 25; // change to your desired interval
```

### Change the AI model

Edit `GEMINI_MODEL` in `src/main.ts`:

```typescript
const GEMINI_MODEL = 'gemini-2.5-flash'; // see https://ai.google.dev/gemini-api/docs/models
```

### Customize the prompt

Edit `systemInstruction` inside `performSummary()` in `src/main.ts`.

## Troubleshooting

### Summarization not triggering automatically

- Verify the Gemini API key is configured in the subreddit's app settings
- Check Devvit logs (`devvit-cli logs`) for errors
- Confirm the post hasn't already been summarized at this milestone (Redis key `lastMilestone:{postId}`)
- Milestones are every 25 comments — ensure the post has crossed the next one

### Manual trigger works but auto-trigger doesn't

- This is often a timing issue: the `CommentCreate` event fires before Reddit's comment count is fully updated. The bot performs an authoritative re-fetch of the post to get the live count, but there can be a short delay.
- Check that `SUMMARY_INTERVAL` in `src/helpers.ts` matches expectations.

### CI upload/publish failing with auth error

- Ensure the `DEVVIT_TOKEN` secret is set and contains the full JSON content of `~/.devvit/token`
- Re-run `devvit-cli login` locally and update the secret with the refreshed token

## License

MIT
