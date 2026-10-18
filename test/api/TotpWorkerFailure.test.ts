import { INTERNAL_SERVER_MESSAGE, resetRateLimitForTests } from '@rexezuge/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '@totp-generator/api';

/**
 * The 5xx boundary, in its own file.
 *
 * `vi.mock` is per-file, so the only way to make generation fail in a way that
 * is *not* the caller's fault is to replace the resolver here and leave the
 * real one alone for every other suite. The assertion the file exists for: the
 * raw failure is reported to the operator and never reaches the client.
 */

const { generateSingleTotp } = vi.hoisted(() => ({ generateSingleTotp: vi.fn() }));

vi.mock('@totp-generator/api/lib/totp', () => ({
  generateSingleTotp,
  computeRemaining: (): number => 30,
}));

const RFC6238_KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RAW_FAILURE = 'otplib exploded while deriving the code';

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

function createContext(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://totp.example${path}`, init), {} as Env, createContext());
}

beforeEach(() => {
  resetRateLimitForTests();
  consoleErrorSpy.mockClear();
  generateSingleTotp.mockReset();
  generateSingleTotp.mockImplementation(() => {
    throw new Error(RAW_FAILURE);
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(59_000));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('an unexpected generation failure', () => {
  it('is masked as a 500 and the raw message survives only in the log', async () => {
    const response = await fetchWorker(`/generate-totp?key=${RFC6238_KEY}`);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      Exception: { Type: 'InternalError', Message: INTERNAL_SERVER_MESSAGE },
    });
    expect(body).not.toContain(RAW_FAILURE);

    expect(String(consoleErrorSpy.mock.calls)).toContain(RAW_FAILURE);
  });

  it('takes the same path for the batch route', async () => {
    const response = await fetchWorker('/generate-totp-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: RFC6238_KEY, digits: 8, offsets: [-30, 0, 30] }),
    });

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      Exception: { Type: 'InternalError', Message: INTERNAL_SERVER_MESSAGE },
    });
    expect(body).not.toContain(RAW_FAILURE);
    expect(String(consoleErrorSpy.mock.calls)).toContain(RAW_FAILURE);
  });
});
