import { BadRequestError } from '@rexezuge/errors';
import type { RouteContext } from '@rexezuge/http';
import { OpenAPIRoute, type OpenAPIRouteSchema } from 'chanfana';
import { z } from 'zod';
import { computeRemaining, generateSingleTotp } from '../../lib/totp';
import { describeIssues } from '../../lib/validation';

const requestSchema = z.object({
  key: z.string().min(16, 'Key must be at least 16 characters long.'),
  digits: z.coerce.number().int().min(6, 'Digits must be between 6 and 8.').max(8, 'Digits must be between 6 and 8.'),
  period: z.coerce.number().int().min(10, 'Period must be between 10 and 60 seconds.').max(60, 'Period must be between 10 and 60 seconds.'),
  algorithm: z.enum(['SHA-1', 'SHA-256', 'SHA-512']).default('SHA-1'),
  timeOffset: z.coerce
    .number()
    .int()
    .min(-3600, 'Time offset must be between -3600 and 3600 seconds.')
    .max(3600, 'Time offset must be between -3600 and 3600 seconds.')
    .default(0),
});

export class GenerateTOTPRoute extends OpenAPIRoute {
  schema: OpenAPIRouteSchema = {
    tags: ['TOTP'],
    summary: 'Generate a TOTP code',
    description:
      'Generates a Time-based One-Time Password (TOTP) based on a provided secret key, number of digits, time period, and algorithm.',
    parameters: [
      {
        name: 'key',
        in: 'query',
        description: 'Secret key for generating TOTP (at least 16 characters).',
        required: true,
        schema: { type: 'string', minLength: 16 },
      },
      {
        name: 'digits',
        in: 'query',
        description: 'Number of digits in the OTP (6 to 8).',
        required: false,
        schema: { type: 'integer', minimum: 6, maximum: 8, default: 6 },
      },
      {
        name: 'period',
        in: 'query',
        description: 'Time period in seconds for OTP expiration (10 to 60).',
        required: false,
        schema: { type: 'integer', minimum: 10, maximum: 60, default: 30 },
      },
      {
        name: 'algorithm',
        in: 'query',
        description: 'Hash algorithm to use for generating TOTP (e.g., SHA-1, SHA-256, SHA-512).',
        required: false,
        schema: { type: 'string', enum: ['SHA-1', 'SHA-256', 'SHA-512'], default: 'SHA-1' },
      },
      {
        name: 'timeOffset',
        in: 'query',
        description: 'Time offset in seconds (e.g., -30 for OTP 30 seconds ago).',
        required: false,
        schema: { type: 'integer', default: 0 },
      },
    ],
    responses: {
      '200': {
        description: 'Successfully generated TOTP',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                otp: { type: 'string' },
                remaining: { type: 'number' },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request parameters',
      },
      '500': {
        description: 'Internal Server Error',
      },
    },
  };

  async handle(c: RouteContext): Promise<Response> {
    const url = new URL(c.req.raw.url);
    const parsedParams = requestSchema.safeParse({
      key: (url.searchParams.get('key') ?? '').replaceAll(/\s+/g, ''),
      digits: url.searchParams.get('digits') ?? '6',
      period: url.searchParams.get('period') ?? '30',
      algorithm: url.searchParams.get('algorithm') ?? 'SHA-1',
      timeOffset: url.searchParams.get('timeOffset') ?? '0',
    });

    if (!parsedParams.success) {
      throw new BadRequestError(`Invalid request parameters: ${describeIssues(parsedParams.error)}`);
    }

    const { key, digits, period, algorithm, timeOffset } = parsedParams.data;
    const otp = generateSingleTotp({ key, digits, period, algorithm, timeOffset });

    return c.json({ otp, remaining: computeRemaining(period) });
  }
}
