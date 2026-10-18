import { ServiceError } from '@rexezuge/errors';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createTotpApi, TOTP_BATCH_PATH } from '../../apps/web/src/lib/api';
import type { TotpBatchResponse } from '../../apps/web/src/lib/api';

/**
 * The API client over a fake transport: the request it sends, and the two
 * failure shapes it turns into one error type.
 */

const PARAMETERS = { key: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', digits: 6, period: 30, algorithm: 'SHA-1' };

const BATCH: TotpBatchResponse = {
  otps: [
    { offset: -30, otp: '111111' },
    { offset: 0, otp: '222222' },
    { offset: 30, otp: '333333' },
  ],
  remaining: 30,
};

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Content-Type': 'application/json' } });
}

function createFetch(respond: () => Promise<Response>): Mock<FetchFn> {
  return vi.fn<FetchFn>().mockImplementation(respond);
}

/**
The JSON request body, with the stringification narrowed out of `BodyInit`.
*/
function parseBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') {
    throw new TypeError('The request body was not a string.');
  }
  return JSON.parse(init.body) as unknown;
}

describe('createTotpApi', () => {
  it('posts the batch request to the batch endpoint with derived offsets', async () => {
    const fetchFn = createFetch(() => Promise.resolve(jsonResponse(BATCH)));
    const api = createTotpApi(fetchFn);

    await api.generateBatch(PARAMETERS);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(TOTP_BATCH_PATH);
    expect(init?.method).toBe('POST');
    expect(parseBody(init)).toEqual({ ...PARAMETERS, offsets: [-30, 0, 30] });
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });

  it('returns the parsed batch', async () => {
    const api = createTotpApi(createFetch(() => Promise.resolve(jsonResponse(BATCH))));

    await expect(api.generateBatch(PARAMETERS)).resolves.toEqual(BATCH);
  });

  it('forwards the abort signal', async () => {
    const fetchFn = createFetch(() => Promise.resolve(jsonResponse(BATCH)));
    const api = createTotpApi(fetchFn);
    const controller = new AbortController();

    await api.generateBatch(PARAMETERS, controller.signal);

    expect(fetchFn.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('turns an HTTP failure into an error carrying the envelope message', async () => {
    const message = 'Invalid request parameters: key: Key must be at least 16 characters long.';
    const api = createTotpApi(
      createFetch(() => Promise.resolve(jsonResponse({ Exception: { Type: 'BadRequest', Message: message } }, 400))),
    );

    await expect(api.generateBatch(PARAMETERS)).rejects.toMatchObject({ status: 400, message });
  });

  it('turns a transport failure into a 500-shaped error', async () => {
    const api = createTotpApi(createFetch(() => Promise.reject(new TypeError('Failed to fetch'))));

    const failure = await api.generateBatch(PARAMETERS).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ServiceError);
    expect(failure).toMatchObject({ status: 500, message: 'Failed to fetch' });
  });
});
