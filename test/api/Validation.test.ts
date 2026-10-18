import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { describeIssues } from '@totp-generator/api/lib/validation';

/**
 * The one sentence both routes fail with, and its `body` fallback: every issue
 * the request schemas can raise carries a field, so the fallback is only
 * reachable from an issue on the request itself — which is exactly what a
 * constructed `ZodError` reproduces.
 */

describe('describeIssues', () => {
  it('names every issue by field', () => {
    const error = new z.ZodError([
      { code: 'custom', message: 'Key must be at least 16 characters long.', path: ['key'] },
      { code: 'custom', message: 'Digits must be between 6 and 8.', path: ['digits'] },
    ]);

    expect(describeIssues(error)).toBe('key: Key must be at least 16 characters long. digits: Digits must be between 6 and 8.');
  });

  it('joins a nested path with dots', () => {
    const error = new z.ZodError([
      { code: 'custom', message: 'Each offset must be between -3600 and 3600 seconds.', path: ['offsets', 0] },
    ]);

    expect(describeIssues(error)).toBe('offsets.0: Each offset must be between -3600 and 3600 seconds.');
  });

  it('falls back to `body` for an issue on the request itself', () => {
    const error = new z.ZodError([{ code: 'custom', message: 'Unrecognised request.', path: [] }]);

    expect(describeIssues(error)).toBe('body: Unrecognised request.');
  });
});
