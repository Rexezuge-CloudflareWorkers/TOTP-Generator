import { useCallback, useEffect, useRef, useState } from 'react';
import { ServiceError } from '@rexezuge/errors';
import { useNotice } from '@rexezuge/web';
import type { Notice } from '@rexezuge/web';
import { TOTP_BATCH_PATH, totpApi } from '../lib/api';
import type { TotpApi } from '../lib/api';
import {
  buildOffsets,
  getCounter,
  getRemaining,
  getSafePeriod,
  PLACEHOLDER_OTP,
  readAutoRefreshPreference,
  writeAutoRefreshPreference,
} from '../lib/otp';

/**
 * The SPA's one state machine: fetch the batch, run the countdown, refetch on
 * rollover, and report what happened.
 *
 * Everything that used to live in `App` and was not a rendered element lives
 * here, so the component tree renders and nothing more.
 */

export interface TotpParameters {
  key: string;
  digits: number;
  period: number;
  algorithm: string;
}

export interface TotpBatch {
  current: string;
  previous: string;
  next: string;
}

export interface RequestLogEntry {
  id: 'batch';
  label: string;
  method: 'POST';
  url: string;
  status: number;
  ok: boolean;
  errorMessage: string | null;
  timestamp: number;
}

export interface UseTotpBatchResult {
  otps: TotpBatch;
  remaining: number;
  request: RequestLogEntry | null;
  autoRefresh: boolean;
  toggleAutoRefresh: () => void;
  notice: Notice | null;
}

/**
 * How long parameter edits settle before the request goes out.
 */
const FETCH_DEBOUNCE_MS = 500;

const COUNTDOWN_TICK_MS = 1000;

export function useTotpBatch({ key, digits, period, algorithm }: Readonly<TotpParameters>, api: TotpApi = totpApi): UseTotpBatchResult {
  const [otps, setOtps] = useState<TotpBatch>({ current: PLACEHOLDER_OTP, previous: PLACEHOLDER_OTP, next: PLACEHOLDER_OTP });
  const [remaining, setRemaining] = useState<number>(() => getRemaining(period));
  const [request, setRequest] = useState<RequestLogEntry | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(readAutoRefreshPreference);
  const { notice, showNotice, dismissNotice } = useNotice();

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCounterRef = useRef<number | null>(null);

  useEffect(() => {
    writeAutoRefreshPreference(autoRefresh);
  }, [autoRefresh]);

  // A request that outlives the component would call `setState` on a tree that
  // is gone; the abort is also what makes the pending rejection silent.
  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const generateBatch = useCallback(async (): Promise<void> => {
    if (!key) {
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    const timestamp = Date.now();
    const safePeriod = getSafePeriod(period);
    const label = `Previous (-${safePeriod}s), Current, Next (+${safePeriod}s)`;

    try {
      const response = await api.generateBatch({ key, digits, period, algorithm }, signal);

      setRequest({ id: 'batch', label, method: 'POST', url: TOTP_BATCH_PATH, status: 200, ok: true, errorMessage: null, timestamp });
      // Record the step the request answered for — even when it fails, below —
      // so the interval sync cannot fire again inside the same step.
      lastCounterRef.current = getCounter(period);
      dismissNotice();

      const [previousOffset, , nextOffset] = buildOffsets(period);
      const otpFor = (offset: number): string | undefined => response.otps.find((entry) => entry.offset === offset)?.otp;
      const current = otpFor(0);
      const previous = otpFor(previousOffset);
      const next = otpFor(nextOffset);

      if (current !== undefined && previous !== undefined && next !== undefined) {
        setOtps({ current, previous, next });
        setRemaining(getRemaining(period));
      } else {
        console.error('The batch response is missing one of the requested offsets.', response.otps);
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        // The request was superseded (or the component unmounted). Its caller
        // already knows; reporting it would surface a cancellation the user
        // never made.
        return;
      }

      lastCounterRef.current = getCounter(period);
      // `ServiceError.from` gives one shape for both failure kinds: an HTTP
      // error keeps its status and the envelope's message; a transport error
      // becomes a 500-shaped error carrying the browser's own sentence.
      const failure = ServiceError.from(error);
      setRequest({
        id: 'batch',
        label,
        method: 'POST',
        url: TOTP_BATCH_PATH,
        status: failure.status,
        ok: false,
        errorMessage: failure.message,
        timestamp,
      });
      showNotice('error', failure.message);
    }
  }, [key, digits, period, algorithm, api, dismissNotice, showNotice]);

  // Debounced so editing the parameters fires one request at the end of the
  // edit, not one per keystroke.
  useEffect(() => {
    if (!key) {
      return;
    }
    const timeout = setTimeout(() => void generateBatch(), FETCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [key, digits, period, algorithm, generateBatch]);

  // The countdown and the rollover fetch, on one absolute-clock interval.
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const sync = (): void => {
      setRemaining(getRemaining(period));
      const currentCounter = getCounter(period);
      if (currentCounter === lastCounterRef.current) {
        return;
      }

      // Marked before the request lands, so a slow network cannot let the
      // next tick fire a second one for the same step.
      lastCounterRef.current = currentCounter;
      void generateBatch();
    };

    // The debounced fetch above owns the refresh for the step it was armed in;
    // resetting here stops this effect from immediately firing another.
    lastCounterRef.current = getCounter(period);

    // Deferred rather than called inline, so the effect body does not set state
    // during render.
    const immediate = setTimeout(sync, 0);
    const interval = setInterval(sync, COUNTDOWN_TICK_MS);

    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        sync();
      }
    };
    const handleFocus = (): void => {
      sync();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleFocus);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
    };
  }, [period, generateBatch, autoRefresh]);

  const toggleAutoRefresh = useCallback((): void => {
    if (autoRefresh) {
      setAutoRefresh(false);
      return;
    }

    // Resuming: refresh at once if the displayed code went stale while paused,
    // otherwise just resync the countdown. Checked before the effect above
    // resets `lastCounterRef`, so the staleness is still visible here.
    if (lastCounterRef.current === getCounter(period)) {
      setRemaining(getRemaining(period));
    } else {
      void generateBatch();
    }
    setAutoRefresh(true);
  }, [autoRefresh, period, generateBatch]);

  return { otps, remaining, request, autoRefresh, toggleAutoRefresh, notice };
}
