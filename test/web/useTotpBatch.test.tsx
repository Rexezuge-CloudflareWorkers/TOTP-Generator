import { BadRequestError } from '@rexezuge/errors';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTotpBatch } from '../../apps/web/src/hooks/useTotpBatch';
import type { TotpParameters } from '../../apps/web/src/hooks/useTotpBatch';
import type { TotpApi, TotpBatchRequest, TotpBatchResponse } from '../../apps/web/src/lib/api';

/**
 * The SPA's state machine, driven by a fake API and a fake clock.
 *
 * `vi.setSystemTime` plus `advanceTimersByTimeAsync` is the whole harness: the
 * hook reads `Date.now()` for its countdown and its rollover decision, so
 * moving that clock is how a rollover, a backgrounded tab and a stale resume
 * are reproduced without waiting for any of them.
 */

const PARAMETERS: TotpParameters = { key: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', digits: 6, period: 30, algorithm: 'SHA-1' };
const OTHER_KEY = 'KRSXG5CTMVRXEZLU';

const BATCH: TotpBatchResponse = {
  otps: [
    { offset: -30, otp: '111111' },
    { offset: 0, otp: '222222' },
    { offset: 30, otp: '333333' },
  ],
  remaining: 30,
};

/**
The hook's `FETCH_DEBOUNCE_MS`.
*/
const DEBOUNCE_MS = 500;

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

function createApi(overrides: Partial<TotpApi> = {}): TotpApi {
  return { generateBatch: vi.fn().mockResolvedValue(BATCH), ...overrides };
}

async function advance(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

beforeEach(() => {
  consoleErrorSpy.mockClear();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
  vi.useRealTimers();
});

describe('useTotpBatch', () => {
  it('waits for the debounce, then publishes previous, current and next', async () => {
    const api = createApi();
    const { result } = renderHook(() => useTotpBatch(PARAMETERS, api));

    expect(api.generateBatch).not.toHaveBeenCalled();

    await advance(DEBOUNCE_MS);

    expect(api.generateBatch).toHaveBeenCalledTimes(1);
    expect(api.generateBatch).toHaveBeenCalledWith(PARAMETERS, expect.any(AbortSignal));
    expect(result.current.otps).toEqual({ current: '222222', previous: '111111', next: '333333' });
    expect(result.current.request).toMatchObject({ ok: true, status: 200, errorMessage: null });
    expect(result.current.remaining).toBe(30);
  });

  it('stays idle while the key is empty', async () => {
    const api = createApi();
    renderHook(() => useTotpBatch({ ...PARAMETERS, key: '' }, api));

    await advance(DEBOUNCE_MS);
    expect(api.generateBatch).not.toHaveBeenCalled();

    // The countdown keeps running without a key, so the rollover still reaches
    // the fetch and is what stops it.
    await advance(30_000);
    expect(api.generateBatch).not.toHaveBeenCalled();
  });

  it('surfaces the envelope message when the request fails', async () => {
    const message = 'Invalid request parameters: key: Key must be at least 16 characters long.';
    const api = createApi({ generateBatch: vi.fn().mockRejectedValue(new BadRequestError(message)) });
    const { result } = renderHook(() => useTotpBatch(PARAMETERS, api));

    await advance(DEBOUNCE_MS);

    expect(result.current.request).toMatchObject({ ok: false, status: 400, errorMessage: message });
    expect(result.current.notice).toEqual({ kind: 'error', message });
  });

  it('refetches when the step rolls over', async () => {
    const api = createApi();
    const { result } = renderHook(() => useTotpBatch(PARAMETERS, api));

    await advance(DEBOUNCE_MS);
    expect(api.generateBatch).toHaveBeenCalledTimes(1);

    await advance(29_000);
    expect(result.current.remaining).toBe(1);
    expect(api.generateBatch).toHaveBeenCalledTimes(1);

    await advance(1000);

    expect(api.generateBatch).toHaveBeenCalledTimes(2);
    expect(result.current.remaining).toBe(30);
  });

  it('pauses on toggle and refreshes a stale code on resume', async () => {
    const api = createApi();
    const { result } = renderHook(() => useTotpBatch(PARAMETERS, api));

    await advance(DEBOUNCE_MS);
    expect(api.generateBatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.toggleAutoRefresh();
    });
    expect(result.current.autoRefresh).toBe(false);

    await advance(60_000);
    expect(api.generateBatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.toggleAutoRefresh();
    });
    await advance(0);

    expect(result.current.autoRefresh).toBe(true);
    expect(api.generateBatch).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('totp-generator:auto-refresh')).toBe('true');
  });

  it('keeps the displayed code when the pause is resumed inside the same step', async () => {
    const api = createApi();
    const { result } = renderHook(() => useTotpBatch(PARAMETERS, api));

    await advance(DEBOUNCE_MS);
    expect(api.generateBatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.toggleAutoRefresh();
    });
    await act(async () => {
      result.current.toggleAutoRefresh();
    });
    await advance(0);

    expect(result.current.autoRefresh).toBe(true);
    expect(api.generateBatch).toHaveBeenCalledTimes(1);
  });

  it('keeps a superseded request silent', async () => {
    const deferreds: Array<{ resolve: (value: TotpBatchResponse) => void; reject: (reason: unknown) => void }> = [];
    const api = createApi({
      generateBatch: vi.fn(
        (_request: TotpBatchRequest, signal?: AbortSignal) =>
          new Promise<TotpBatchResponse>((resolve, reject) => {
            deferreds.push({ resolve, reject });
            signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      ),
    });

    const { result, rerender } = renderHook((props: TotpParameters) => useTotpBatch(props, api), { initialProps: PARAMETERS });

    await advance(DEBOUNCE_MS);
    rerender({ ...PARAMETERS, key: OTHER_KEY });
    await advance(DEBOUNCE_MS);

    expect(deferreds).toHaveLength(2);
    expect(result.current.request).toBeNull();
    expect(result.current.notice).toBeNull();

    const second = deferreds.at(1);
    if (second === undefined) {
      throw new Error('The second request was never issued.');
    }
    await act(async () => {
      second.resolve(BATCH);
    });

    expect(result.current.otps).toEqual({ current: '222222', previous: '111111', next: '333333' });
    expect(result.current.request).toMatchObject({ ok: true, status: 200 });
  });

  it('logs a batch response that is missing an offset', async () => {
    const api = createApi({ generateBatch: vi.fn().mockResolvedValue({ otps: [{ offset: 0, otp: '222222' }], remaining: 30 }) });
    const { result } = renderHook(() => useTotpBatch(PARAMETERS, api));

    await advance(DEBOUNCE_MS);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('missing one of the requested offsets'), expect.anything());
    expect(result.current.otps).toEqual({ current: '------', previous: '------', next: '------' });
  });

  it('resyncs when the tab becomes visible again', async () => {
    const api = createApi();
    const { result } = renderHook(() => useTotpBatch(PARAMETERS, api));

    await advance(DEBOUNCE_MS);
    expect(api.generateBatch).toHaveBeenCalledTimes(1);

    // A backgrounded tab: its interval is throttled away, so the clock moves on
    // without a single tick running.
    vi.setSystemTime(120_000);

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(api.generateBatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(api.generateBatch).toHaveBeenCalledTimes(2);
    expect(result.current.remaining).toBe(30);
  });

  it('does not refetch on focus while the displayed step is current', async () => {
    const api = createApi();
    renderHook(() => useTotpBatch(PARAMETERS, api));

    await advance(DEBOUNCE_MS);

    await act(async () => {
      globalThis.dispatchEvent(new Event('focus'));
    });

    expect(api.generateBatch).toHaveBeenCalledTimes(1);
  });
});
