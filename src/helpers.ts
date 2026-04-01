export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, msg: string, data?: unknown): void {
  const entry = JSON.stringify({ level, msg, ...(data !== undefined ? { data } : {}) });
  level === 'error' ? console.error(entry) : console.log(entry);
}

export interface CommentLike {
  body?: string;
  score: number;
}

export function isUsableComment(body: string | undefined): boolean {
  if (!body) return false;
  const trimmed = body.trim();
  return trimmed.length > 0 && trimmed !== '[removed]' && trimmed !== '[deleted]';
}

export function buildCommentTexts(comments: CommentLike[]): string {
  return comments
    .filter((c) => isUsableComment(c.body))
    .map((c, i) => `Commento ${i + 1} (${c.score} upvote):\n${c.body!.trim()}`)
    .join('\n\n---\n\n');
}
