import { resetRateLimitForTests } from '@rexezuge/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '@totp-generator/api';
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '@totp-generator/api/TotpWorker';

/**
 * The worker as the platform drives it: one `fetch` per request, through the
 * whole stack — CORS, security headers, the limiter, chanfana, the routes — so
 * a header or a status that only exists in the wiring is asserted here rather
 * than inferred from the units.
 */

/**
RFC 6238's SHA-1 secret, Base32-encoded.
*/
const RFC6238_KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/**
The RFC's timestamp, epoch 59: `remaining` is 1 for a 30-second period.
*/
const RFC_EPOCH_MS = 59_000;

const CLIENT_IP = '203.0.113.7';

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

function createContext(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function fetchWorker(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('CF-Connecting-IP')) {
    headers.set('CF-Connecting-IP', CLIENT_IP);
  }
  const request = new Request(`https://totp.example${path}`, { ...init, headers });
  return worker.fetch(request, {} as Env, createContext());
}

function postBatch(body: unknown): Promise<Response> {
  return fetchWorker('/generate-totp-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  consoleErrorSpy.mockClear();
  resetRateLimitForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(RFC_EPOCH_MS));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /generate-totp', () => {
  it('generates the RFC 6238 vector and reports the seconds left', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}&digits=8`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ otp: '94287082', remaining: 1 });
  });

  it('defaults to six digits, a thirty-second period and SHA-1', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ otp: '287082', remaining: 1 });
  });

  it('strips whitespace and case from the key', async () => {
    const padded = `%20${RFC6238_KEY.toLowerCase()}%20`;
    const response = await fetchWorker(`/generate-totp?key=${padded}&digits=8`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ otp: '94287082', remaining: 1 });
  });

  it('marks the response as secret-bearing', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}`);

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('answers cross-origin callers and their preflight', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}`, { headers: { Origin: 'https://example.com' } });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const preflight = await fetchWorker('/generate-totp', {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'GET' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('answers 400 with the validation message that names the field', async () => {
    const response = await fetchWorker('/generate-totp?key=short');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: expect.stringContaining('key: Key must be at least 16 characters long.'),
      },
    });
  });

  it('treats a missing key as the same validation failure', async () => {
    const response = await fetchWorker('/generate-totp');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: 'Invalid request parameters: key: Key must be at least 16 characters long.',
      },
    });
  });

  it('rejects an out-of-range digit count', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}&digits=9`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: expect.stringContaining('digits: Digits must be between 6 and 8.'),
      },
    });
  });

  it('applies an explicit period and algorithm', async () => {
    const periodResponse = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}&digits=8&period=60`);
    expect(await periodResponse.json()).toEqual({ otp: '84755224', remaining: 1 });

    const algorithmResponse = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}&digits=8&algorithm=SHA-256`);
    expect(await algorithmResponse.json()).toEqual({ otp: '32247374', remaining: 1 });
  });

  it('shifts the clock by the requested offset', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}&digits=8&timeOffset=-30`);

    expect(await response.json()).toEqual({ otp: '84755224', remaining: 1 });
  });

  it('rejects an unknown algorithm', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}&algorithm=MD5`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: 'Invalid request parameters: algorithm: Invalid option: expected one of "SHA-1"|"SHA-256"|"SHA-512"',
      },
    });
  });

  it('rejects an out-of-range period', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}&period=5`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: 'Invalid request parameters: period: Period must be between 10 and 60 seconds.',
      },
    });
  });

  it('rejects an out-of-range time offset', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}&timeOffset=4000`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: 'Invalid request parameters: timeOffset: Time offset must be between -3600 and 3600 seconds.',
      },
    });
  });

  it('classifies a key otplib cannot decode as 400, not a masked 500', async () => {
    // Sixteen characters, so it clears the length rule; `1`, `8`, `9` and `0`
    // are outside the Base32 alphabet, which is where generation fails.
    const response = await fetchWorker('/generate-totp?key=1234567890123456');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: expect.stringContaining('Unable to generate a TOTP code: Invalid Base32 string'),
      },
    });
  });
});

describe('POST /generate-totp-batch', () => {
  it('generates one code per requested offset', async () => {
    const response = await postBatch({ key: RFC6238_KEY, digits: 8, offsets: [-30, 0, 30] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      otps: [
        { offset: -30, otp: '84755224' },
        { offset: 0, otp: '94287082' },
        { offset: 30, otp: '37359152' },
      ],
      remaining: 1,
    });
  });

  it('defaults to the previous, current and next steps', async () => {
    const response = await postBatch({ key: RFC6238_KEY, digits: 8 });

    expect(await response.json()).toEqual({
      otps: [
        { offset: -30, otp: '84755224' },
        { offset: 0, otp: '94287082' },
        { offset: 30, otp: '37359152' },
      ],
      remaining: 1,
    });
  });

  it('applies the algorithm to every entry', async () => {
    const response = await postBatch({ key: RFC6238_KEY, digits: 8, algorithm: 'SHA-256', offsets: [-30, 0] });

    expect(await response.json()).toEqual({
      otps: [
        { offset: -30, otp: '74875740' },
        { offset: 0, otp: '32247374' },
      ],
      remaining: 1,
    });
  });

  it('rejects more offsets than the cap', async () => {
    const response = await postBatch({ key: RFC6238_KEY, offsets: Array.from({ length: 11 }, (_, index) => index) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: expect.stringContaining('At most 10 offsets are allowed.'),
      },
    });
  });

  it('rejects an offset outside the supported range', async () => {
    const response = await postBatch({ key: RFC6238_KEY, offsets: [10_000] });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: expect.stringContaining('offsets.0: Each offset must be between -3600 and 3600 seconds.'),
      },
    });
  });

  it('requires at least one offset', async () => {
    const response = await postBatch({ key: RFC6238_KEY, offsets: [] });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: 'Invalid request parameters: offsets: At least one offset is required.',
      },
    });
  });

  it('treats a malformed body like any other invalid input', async () => {
    const response = await postBatch('this is not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: expect.stringContaining('Invalid request parameters: key: Key must be at least 16 characters long.'),
      },
    });
  });

  it('treats a body that is not an object like one too', async () => {
    const response = await postBatch(42);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: expect.stringContaining('Invalid request parameters: key: Key must be at least 16 characters long.'),
      },
    });
  });

  it('classifies a key otplib cannot decode as 400', async () => {
    const response = await postBatch({ key: '1234567890123456', digits: 8, offsets: [-30, 0, 30] });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      Exception: {
        Type: 'BadRequest',
        Message: expect.stringContaining('Unable to generate a TOTP code'),
      },
    });
  });
});

describe('the worker boundary', () => {
  it('answers an unknown path with the JSON envelope', async () => {
    const response = await fetchWorker('/no-such-route');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      Exception: { Type: 'NotFound', Message: 'No route matches this request.' },
    });
  });

  it('publishes the OpenAPI document for both routes', async () => {
    const response = await fetchWorker('/openapi.json');

    expect(response.status).toBe(200);
    const document = (await response.json()) as { paths?: Record<string, unknown> };
    expect(Object.keys(document.paths ?? {})).toEqual(expect.arrayContaining(['/generate-totp', '/generate-totp-batch']));
  });

  it('serves the docs page', async () => {
    const response = await fetchWorker('/docs');

    expect(response.status).toBe(200);
    // The docs page is not secret-bearing, so `no-store` is the API's marker
    // and its absence here is the predicate returning false.
    expect(response.headers.get('Cache-Control')).not.toBe('no-store');
  });

  it('is a no-op when the platform invokes the schedule', async () => {
    // This worker declares no cron triggers, so the platform never dispatches
    // here; the assertion pins the empty body as the intended behaviour rather
    // than an oversight.
    const event = { cron: '0 0 * * *', scheduledTime: 0, noRetry: vi.fn() };

    await expect(worker.scheduled(event, {} as Env, createContext())).resolves.toBeUndefined();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe('the rate limit', () => {
  it(`allows ${RATE_LIMIT_MAX_REQUESTS} requests and the next one is a 429`, async () => {
    for (let request = 0; request < RATE_LIMIT_MAX_REQUESTS; request += 1) {
      const response = await fetchWorker('/generate-totp?key=short');
      expect(response.status).toBe(400);
    }

    const throttled = await fetchWorker('/generate-totp?key=short');
    const retryAfterSeconds = RATE_LIMIT_WINDOW_MS / 1000;

    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('Retry-After')).toBe(String(retryAfterSeconds));
    expect(await throttled.json()).toEqual({
      Exception: { Type: 'RateLimited', Message: `Too many requests. Retry after ${retryAfterSeconds}s.` },
    });
  });

  it('keys the budget per client address', async () => {
    for (let request = 0; request < RATE_LIMIT_MAX_REQUESTS; request += 1) {
      await fetchWorker('/generate-totp?key=short');
    }

    const otherClient = await fetchWorker('/generate-totp?key=short', { headers: { 'CF-Connecting-IP': '198.51.100.9' } });

    expect(otherClient.status).toBe(400);
  });
});
