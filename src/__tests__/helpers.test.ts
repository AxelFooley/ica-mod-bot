import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, isUsableComment, buildCommentTexts } from '../helpers.js';

// ---------------------------------------------------------------------------
// log()
// ---------------------------------------------------------------------------
describe('log', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes info entries to console.log as valid JSON', () => {
    log('info', 'hello');
    expect(logSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({ level: 'info', msg: 'hello' });
  });

  it('includes data field when provided', () => {
    log('warn', 'something', { count: 3 });
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({
      level: 'warn',
      msg: 'something',
      data: { count: 3 },
    });
  });

  it('writes error entries to console.error, not console.log', () => {
    log('error', 'boom');
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('omits data key when data is undefined', () => {
    log('info', 'no-data');
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect('data' in parsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isUsableComment()
// ---------------------------------------------------------------------------
describe('isUsableComment', () => {
  it('returns false for undefined', () => {
    expect(isUsableComment(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isUsableComment('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isUsableComment('   ')).toBe(false);
  });

  it('returns false for [removed]', () => {
    expect(isUsableComment('[removed]')).toBe(false);
  });

  it('returns false for [deleted]', () => {
    expect(isUsableComment('[deleted]')).toBe(false);
  });

  it('returns false for [removed] with surrounding whitespace', () => {
    expect(isUsableComment('  [removed]  ')).toBe(false);
  });

  it('returns true for a normal comment', () => {
    expect(isUsableComment('This is a great post!')).toBe(true);
  });

  it('returns true for a single-character comment', () => {
    expect(isUsableComment('.')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCommentTexts()
// ---------------------------------------------------------------------------
describe('buildCommentTexts', () => {
  it('returns empty string for empty array', () => {
    expect(buildCommentTexts([])).toBe('');
  });

  it('filters out removed, deleted, and empty comments', () => {
    const result = buildCommentTexts([
      { body: '[removed]', score: 10 },
      { body: '[deleted]', score: 5 },
      { score: 1 }, // body absent (optional field)
      { body: '   ', score: 2 },
    ]);
    expect(result).toBe('');
  });

  it('formats a single usable comment correctly', () => {
    const result = buildCommentTexts([{ body: 'Hello world', score: 42 }]);
    expect(result).toBe('Commento 1 (42 upvote):\nHello world');
  });

  it('numbers comments sequentially after filtering removals', () => {
    const comments = [
      { body: '[removed]', score: 0 },
      { body: 'First real comment', score: 10 },
      { body: 'Second real comment', score: 5 },
    ];
    const result = buildCommentTexts(comments);
    expect(result).toContain('Commento 1 (10 upvote):\nFirst real comment');
    expect(result).toContain('Commento 2 (5 upvote):\nSecond real comment');
  });

  it('joins multiple comments with the separator', () => {
    const comments = [
      { body: 'A', score: 1 },
      { body: 'B', score: 2 },
    ];
    const result = buildCommentTexts(comments);
    expect(result).toBe('Commento 1 (1 upvote):\nA\n\n---\n\nCommento 2 (2 upvote):\nB');
  });

  it('trims whitespace from comment bodies', () => {
    const result = buildCommentTexts([{ body: '  trimmed  ', score: 3 }]);
    expect(result).toBe('Commento 1 (3 upvote):\ntrimmed');
  });

  it('handles a mix of usable and unusable comments', () => {
    const comments = [
      { body: 'Good comment', score: 100 },
      { body: '', score: 0 },
      { body: 'Another good one', score: 50 },
      { body: '[removed]', score: 20 },
    ];
    const result = buildCommentTexts(comments);
    expect(result).toContain('Commento 1 (100 upvote)');
    expect(result).toContain('Commento 2 (50 upvote)');
    expect(result).not.toContain('Commento 3');
  });
});
