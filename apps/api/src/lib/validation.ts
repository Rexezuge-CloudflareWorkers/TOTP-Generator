import type { z } from 'zod';

/**
 * One sentence naming every offending field.
 *
 * The whole issue list rather than the first: a caller that got two parameters
 * wrong should learn both from one round trip. `body` stands in for an issue on
 * the request itself (a missing batch body, for example), which has no path.
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join(' ');
}
