import { createApiClient } from '@rexezuge/web';
import type { ApiClient, FetchFn } from '@rexezuge/web';
import { buildOffsets } from './otp';

/**
 * The API client.
 *
 * One request shape goes out — the batch endpoint, with the previous, current
 * and next offsets — so there is no `get`/`post` surface to keep in sync here,
 * just typed bodies.
 */

export interface TotpBatchRequest {
  key: string;
  digits: number;
  period: number;
  algorithm: string;
}

export interface TotpBatchEntry {
  offset: number;
  otp: string;
}

export interface TotpBatchResponse {
  otps: TotpBatchEntry[];
  remaining: number;
}

export const TOTP_BATCH_PATH = '/generate-totp-batch';

export interface TotpApi {
  generateBatch(request: TotpBatchRequest, signal?: AbortSignal): Promise<TotpBatchResponse>;
}

/**
 * Build the API over a specific `fetch`.
 *
 * A factory rather than a module-level constant so tests drive it with a fake
 * transport — including one that never settles, which is how the abort path is
 * exercised.
 */
export function createTotpApi(fetchFn: FetchFn): TotpApi {
  const client: ApiClient = createApiClient(fetchFn);

  return {
    generateBatch(request, signal) {
      return client.request<TotpBatchResponse>(TOTP_BATCH_PATH, {
        method: 'POST',
        body: { ...request, offsets: buildOffsets(request.period) },
        signal,
      });
    },
  };
}

/**
 * The app's client, over the ambient `fetch`.
 *
 * The arrow defers the global lookup to call time, so a test that stubs
 * `globalThis.fetch` after this module is imported still intercepts every
 * request.
 */
export const totpApi: TotpApi = createTotpApi((input, init) => fetch(input, init));
