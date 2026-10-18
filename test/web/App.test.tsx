import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../apps/web/src/App';
import type { TotpBatchResponse } from '../../apps/web/src/lib/api';

/**
 * The SPA as a whole, over a stubbed `fetch`: what a person sees after the
 * debounced request lands, and what each control does. Timers are fake, so the
 * debounce is advanced rather than waited for.
 */

const BATCH: TotpBatchResponse = {
  otps: [
    { offset: -30, otp: '111111' },
    { offset: 0, otp: '222222' },
    { offset: 30, otp: '333333' },
  ],
  remaining: 30,
};

const DEBOUNCE_MS = 500;

const fetchMock = vi.fn<typeof fetch>();
const writeText = vi.fn<() => Promise<void>>();

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Content-Type': 'application/json' } });
}

/**
Queue the response the next request will see.
*/
function respondWith(body: unknown, status = 200): void {
  fetchMock.mockResolvedValueOnce(jsonResponse(body, status));
}

async function settle(milliseconds = DEBOUNCE_MS): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function requestBody(callIndex: number): Record<string, unknown> {
  const body = fetchMock.mock.calls[callIndex]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new TypeError('The request body was not a string.');
  }
  return JSON.parse(body) as Record<string, unknown>;
}

beforeEach(() => {
  fetchMock.mockReset();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('the TOTP page', () => {
  it('starts from a random key and shows the batch once the request lands', async () => {
    respondWith(BATCH);
    render(<App />);

    expect(screen.getByRole('heading', { name: 'TOTP Generator' })).toBeInTheDocument();
    const keyInput = screen.getByLabelText('Secret key') as HTMLInputElement;
    expect(keyInput.value).toMatch(/^[A-Z2-7]{16}$/);
    expect(screen.getAllByText('------')).toHaveLength(3);

    expect(fetchMock).not.toHaveBeenCalled();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBody(0)).toMatchObject({ key: keyInput.value, digits: 6, period: 30, algorithm: 'SHA-1', offsets: [-30, 0, 30] });
    expect(screen.getByText('111111')).toBeInTheDocument();
    expect(screen.getByText('333333')).toBeInTheDocument();
    expect(screen.getByText(/Time left:/)).toHaveTextContent('Time left: 30s');
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('Previous (-30s), Current, Next (+30s)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'OpenAPI documentation' })).toHaveAttribute('href', '/docs');
  });

  it('copies the current code', async () => {
    respondWith(BATCH);
    render(<App />);
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await act(async () => {});

    expect(writeText).toHaveBeenCalledWith('222222');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('alerts with the API message and keeps it in the request log', async () => {
    const message = 'Invalid request parameters: key: Key must be at least 16 characters long.';
    respondWith({ Exception: { Type: 'BadRequest', Message: message } }, 400);
    render(<App />);
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByText('400')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show error message' }));
    expect(screen.getByText(message, { selector: 'pre' })).toBeInTheDocument();
  });

  it('regenerates the key on demand', () => {
    respondWith(BATCH);
    render(<App />);

    const keyInput = screen.getByLabelText('Secret key') as HTMLInputElement;
    const before = keyInput.value;

    fireEvent.click(screen.getByRole('button', { name: 'Random key' }));

    expect(keyInput.value).toMatch(/^[A-Z2-7]{16}$/);
    expect(keyInput.value).not.toBe(before);
  });

  it('pauses the countdown from the progress bar', async () => {
    respondWith(BATCH);
    render(<App />);
    await settle();

    expect(screen.getByRole('switch', { name: 'Toggle auto-refresh on countdown' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle auto-refresh on countdown' }));

    expect(screen.getByRole('switch', { name: 'Toggle auto-refresh on countdown' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('(paused)')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches with the edited algorithm and digit count', async () => {
    respondWith(BATCH);
    render(<App />);
    await settle();

    respondWith(BATCH);
    fireEvent.change(screen.getByLabelText('Digits'), { target: { value: '8' } });
    await settle();
    expect(requestBody(1)).toMatchObject({ digits: 8, algorithm: 'SHA-1' });

    respondWith(BATCH);
    fireEvent.change(screen.getByLabelText('Algorithm'), { target: { value: 'SHA-512' } });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestBody(2)).toMatchObject({ digits: 8, algorithm: 'SHA-512' });
  });

  it('refetches with the edited key and period', async () => {
    respondWith(BATCH);
    render(<App />);
    await settle();

    respondWith(BATCH);
    fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'MFRGGZDFMZTWQ2LK' } });
    await settle();
    expect(requestBody(1)).toMatchObject({ key: 'MFRGGZDFMZTWQ2LK' });

    respondWith(BATCH);
    fireEvent.change(screen.getByLabelText('Period (seconds)'), { target: { value: '60' } });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestBody(2)).toMatchObject({ key: 'MFRGGZDFMZTWQ2LK', period: 60 });
  });

  it('sends zero rather than NaN when a number field is emptied', async () => {
    respondWith(BATCH);
    render(<App />);
    await settle();

    respondWith(BATCH);
    fireEvent.change(screen.getByLabelText('Digits'), { target: { value: '' } });
    await settle();

    expect(requestBody(1)).toMatchObject({ digits: 0 });
  });
});
