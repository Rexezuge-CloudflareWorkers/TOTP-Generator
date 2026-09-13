import { useState, useEffect, useCallback, useRef } from 'react';

type RequestId = 'batch';

type RequestStatusEntry = {
  id: RequestId;
  label: string;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  errorMessage: string | null;
  timestamp: number;
};

type BatchOtpEntry = {
  offset: number;
  otp: string;
};

type FetchResult = {
  entry: RequestStatusEntry;
  otps?: BatchOtpEntry[];
  remaining?: number;
};

function extractErrorMessage(
  bodyText: string,
  status: number,
  statusText: string
): string {
  if (!bodyText) {
    return statusText
      ? `${status} ${statusText}`
      : `Request failed with status ${status}`;
  }
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (typeof parsed === 'string') return parsed;
    if (parsed !== null && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof record.error === 'string') parts.push(record.error);
      if (typeof record.message === 'string') parts.push(record.message);
      if (record.details !== undefined)
        parts.push(
          typeof record.details === 'string'
            ? record.details
            : JSON.stringify(record.details, null, 2)
        );
      if (parts.length > 0) return parts.join('\n');
    }
    return bodyText;
  } catch {
    return bodyText;
  }
}

async function fetchTotpBatch(
  id: RequestId,
  label: string,
  url: string,
  body: {
    key: string;
    digits: number;
    period: number;
    algorithm: string;
    offsets: number[];
  },
  signal: AbortSignal
): Promise<FetchResult | null> {
  const timestamp = Date.now();
  const entryBase = { id, label, method: 'POST', url, timestamp };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const bodyText = await response.text();
    if (!response.ok) {
      return {
        entry: {
          ...entryBase,
          status: response.status,
          ok: false,
          errorMessage: extractErrorMessage(
            bodyText,
            response.status,
            response.statusText
          ),
        },
      };
    }
    try {
      const data = JSON.parse(bodyText) as {
        otps: BatchOtpEntry[];
        remaining: number;
      };
      return {
        entry: {
          ...entryBase,
          status: response.status,
          ok: true,
          errorMessage: null,
        },
        otps: data.otps,
        remaining: data.remaining,
      };
    } catch {
      return {
        entry: {
          ...entryBase,
          status: response.status,
          ok: false,
          errorMessage: bodyText || 'Invalid JSON response from server.',
        },
      };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return null;
    return {
      entry: {
        ...entryBase,
        status: 0,
        ok: false,
        errorMessage:
          error instanceof Error ? error.message : 'Network request failed.',
      },
    };
  }
}

function generateRandomKey() {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let key = '';
  for (let i = 0; i < 16; i++) {
    key += charset[Math.floor(Math.random() * charset.length)];
  }
  return key;
}

function getSafePeriod(periodSec: number): number {
  return Number.isFinite(periodSec) && periodSec > 0
    ? Math.floor(periodSec)
    : 30;
}

function getRemaining(periodSec: number): number {
  const safe = getSafePeriod(periodSec);
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = safe - (nowSec % safe);
  return Math.min(Math.max(remaining, 1), safe);
}

function getCounter(periodSec: number): number {
  const safe = getSafePeriod(periodSec);
  return Math.floor(Math.floor(Date.now() / 1000) / safe);
}

function App() {
  const [key, setKey] = useState(generateRandomKey);
  const [digits, setDigits] = useState(6);
  const [period, setPeriod] = useState(30);
  const [algorithm, setAlgorithm] = useState('SHA-1');
  const [otp, setOtp] = useState('------');
  const [prevOtp, setPrevOtp] = useState('------');
  const [nextOtp, setNextOtp] = useState('------');
  const [remaining, setRemaining] = useState(30);
  const [copyIcon, setCopyIcon] = useState('📋');
  const [requests, setRequests] = useState<RequestStatusEntry[]>([]);
  const [expandedId, setExpandedId] = useState<RequestId | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCounterRef = useRef<number | null>(null);

  const generateOTP = useCallback(async () => {
    if (!key) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    const safePeriod = getSafePeriod(period);
    const base = `/generate-totp-batch`;
    const offsets = [-safePeriod, 0, safePeriod];

    const result = await fetchTotpBatch(
      'batch',
      `Previous (-${safePeriod}s), Current, Next (+${safePeriod}s)`,
      base,
      { key, digits, period, algorithm, offsets },
      signal
    );

    if (result === null) return;

    setRequests([result.entry]);
    // Record the counter we just fetched (even on failure) so the
    // interval sync doesn't retry every second and spam the backend.
    // Remaining display is driven by wall-clock, so it stays correct.
    lastCounterRef.current = getCounter(period);

    if (
      result.entry.ok &&
      result.otps !== undefined &&
      result.remaining !== undefined
    ) {
      const otpFor = (offset: number) =>
        result.otps?.find((o) => o.offset === offset)?.otp;
      const current = otpFor(0);
      const prev = otpFor(-safePeriod);
      const next = otpFor(safePeriod);
      if (current !== undefined && prev !== undefined && next !== undefined) {
        setOtp(current);
        setPrevOtp(prev);
        setNextOtp(next);
        setRemaining(getRemaining(period));
      } else {
        console.error(
          'Error fetching OTP (batch): missing offset in response',
          result.otps
        );
      }
    } else {
      if (!result.entry.ok)
        console.error(
          `Error fetching OTP (${result.entry.id}):`,
          result.entry.errorMessage
        );
    }
  }, [key, digits, period, algorithm]);

  useEffect(() => {
    if (key) {
      const timeout = setTimeout(generateOTP, 500);
      return () => clearTimeout(timeout);
    }
  }, [key, digits, period, algorithm, generateOTP]);

  useEffect(() => {
    // Absolute wall-clock sync: recompute from Date.now() every tick so
    // drift can't accumulate and background-tab throttling self-heals.
    const sync = () => {
      setRemaining(getRemaining(period));
      const currentCounter = getCounter(period);
      if (currentCounter !== lastCounterRef.current) {
        // Mark optimistically to avoid duplicate fetches while the
        // request is in flight (e.g. slow network + 1s interval).
        lastCounterRef.current = currentCounter;
        void generateOTP();
      }
    };

    // Reset to the current counter so the debounced param-change fetch
    // (above) owns the refresh and this effect doesn't double-fetch.
    lastCounterRef.current = getCounter(period);

    // Immediate display refresh without a synchronous setState in the
    // effect body (keeps react-hooks/set-state-in-effect happy).
    const immediate = setTimeout(sync, 0);
    const interval = setInterval(sync, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    const handleFocus = () => sync();

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
  }, [period, generateOTP]);

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(otp)
      .then(() => {
        setCopyIcon('✔');
        setTimeout(() => setCopyIcon('📋'), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy OTP:', err);
      });
  };

  const safePeriodForDisplay = getSafePeriod(period);

  return (
    <div className="flex flex-col items-center p-5 min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-6 bg-white border border-gray-300 rounded-lg shadow-sm">
        <h2 className="text-2xl font-bold text-center mb-6">TOTP Generator</h2>

        <div className="mb-4">
          <label
            htmlFor="key"
            className="block mb-2 font-semibold text-gray-700"
          >
            Secret Key:
          </label>
          <input
            type="text"
            id="key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter TOTP Key"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="digits"
            className="block mb-2 font-semibold text-gray-700"
          >
            Digits:
          </label>
          <input
            type="number"
            id="digits"
            value={digits}
            onChange={(e) => setDigits(parseInt(e.target.value, 10))}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="period"
            className="block mb-2 font-semibold text-gray-700"
          >
            Period (seconds):
          </label>
          <input
            type="number"
            id="period"
            value={period}
            onChange={(e) => setPeriod(parseInt(e.target.value, 10))}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="algorithm"
            className="block mb-2 font-semibold text-gray-700"
          >
            Algorithm:
          </label>
          <select
            id="algorithm"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="SHA-1">SHA-1</option>
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-512">SHA-512</option>
          </select>
        </div>

        <div className="text-center mb-4">
          <h3 className="text-xl font-semibold">
            Current:{' '}
            <span className="font-mono text-2xl text-blue-600">{otp}</span>
            <button
              onClick={copyToClipboard}
              className="ml-3 text-2xl hover:bg-gray-100 p-1 rounded"
            >
              {copyIcon}
            </button>
          </h3>
          <div className="flex justify-center gap-8 mt-2">
            <p className="text-sm text-gray-500">
              Previous: <span className="font-mono text-lg">{prevOtp}</span>
            </p>
            <p className="text-sm text-gray-500">
              Next: <span className="font-mono text-lg">{nextOtp}</span>
            </p>
          </div>
        </div>

        <div className="mb-4">
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-1000 ease-linear"
              style={{
                width: `${(remaining / safePeriodForDisplay) * 100}%`,
              }}
            ></div>
          </div>
        </div>

        <p className="text-center text-gray-600">
          Time Left: <span className="font-semibold">{remaining}</span> sec
        </p>

        <div className="mt-6 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Backend Requests
          </h3>
          {requests.length === 0 ? (
            <p className="text-sm text-gray-400">No requests yet.</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((req) => {
                const isSuccess = req.ok && req.status === 200;
                const isExpanded = expandedId === req.id;
                const statusLabel =
                  req.status === 0 ? 'ERR' : String(req.status);
                const badgeClass = isSuccess
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800';
                const rowContent = (
                  <>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 font-mono text-xs font-semibold text-gray-500">
                        {req.method}
                      </span>
                      <span className="shrink-0 text-sm text-gray-700">
                        {req.label}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-xs text-gray-400"
                        title={req.url}
                      >
                        {req.url}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-semibold ${badgeClass}`}
                      title={
                        req.status === 0
                          ? 'Network error (no HTTP status)'
                          : `HTTP status ${req.status}`
                      }
                    >
                      {statusLabel}
                    </span>
                  </>
                );

                return (
                  <li key={req.id}>
                    {isSuccess || !req.errorMessage ? (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 cursor-default">
                        {rowContent}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : req.id)
                          }
                          aria-expanded={isExpanded}
                          title="Show error message"
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-red-200 px-3 py-2 text-left hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          {rowContent}
                        </button>
                        {isExpanded && (
                          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-red-200 bg-red-50 p-2 font-mono text-xs text-red-800">
                            {req.errorMessage}
                          </pre>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-gray-600">
          For more details on the API, please visit the{' '}
          <a
            href={`/docs`}
            target="_blank"
            className="text-blue-600 hover:underline"
          >
            OpenAPI documentation
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default App;
