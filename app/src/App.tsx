import { useState, useEffect, useCallback, useRef } from 'react';

type RequestId = 'current' | 'previous' | 'next';

type RequestStatusEntry = {
  id: RequestId;
  label: string;
  url: string;
  status: number;
  ok: boolean;
  errorMessage: string | null;
  timestamp: number;
};

type FetchResult = {
  entry: RequestStatusEntry;
  otp?: string;
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

async function fetchTotpRequest(
  id: RequestId,
  label: string,
  url: string,
  signal: AbortSignal
): Promise<FetchResult | null> {
  const timestamp = Date.now();
  try {
    const response = await fetch(url, { signal });
    const bodyText = await response.text();
    if (!response.ok) {
      return {
        entry: {
          id,
          label,
          url,
          status: response.status,
          ok: false,
          errorMessage: extractErrorMessage(
            bodyText,
            response.status,
            response.statusText
          ),
          timestamp,
        },
      };
    }
    try {
      const data = JSON.parse(bodyText) as { otp: string; remaining: number };
      return {
        entry: {
          id,
          label,
          url,
          status: response.status,
          ok: true,
          errorMessage: null,
          timestamp,
        },
        otp: data.otp,
        remaining: data.remaining,
      };
    } catch {
      return {
        entry: {
          id,
          label,
          url,
          status: response.status,
          ok: false,
          errorMessage: bodyText || 'Invalid JSON response from server.',
          timestamp,
        },
      };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return null;
    return {
      entry: {
        id,
        label,
        url,
        status: 0,
        ok: false,
        errorMessage:
          error instanceof Error ? error.message : 'Network request failed.',
        timestamp,
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

    const base = `/generate-totp?key=${encodeURIComponent(key)}&digits=${digits}&period=${period}&algorithm=${algorithm}`;
    const targets: Array<{ id: RequestId; label: string; url: string }> = [
      { id: 'current', label: 'Current', url: base },
      {
        id: 'previous',
        label: 'Previous (-30s)',
        url: `${base}&timeOffset=-30`,
      },
      { id: 'next', label: 'Next (+30s)', url: `${base}&timeOffset=30` },
    ];

    const results = await Promise.all(
      targets.map((t) => fetchTotpRequest(t.id, t.label, t.url, signal))
    );

    if (results.some((r) => r === null)) return;

    const entries = (results as FetchResult[]).map((r) => r.entry);
    setRequests(entries);

    const [current, prev, next] = results as FetchResult[];
    if (
      current.entry.ok &&
      prev.entry.ok &&
      next.entry.ok &&
      current.otp !== undefined &&
      prev.otp !== undefined &&
      next.otp !== undefined
    ) {
      setOtp(current.otp);
      setPrevOtp(prev.otp);
      setNextOtp(next.otp);
      if (current.remaining !== undefined) setRemaining(current.remaining);
    } else {
      results.forEach((r) => {
        if (r && !r.entry.ok)
          console.error(
            `Error fetching OTP (${r.entry.id}):`,
            r.entry.errorMessage
          );
      });
    }
  }, [key, digits, period, algorithm]);

  useEffect(() => {
    if (key) {
      const timeout = setTimeout(generateOTP, 500);
      return () => clearTimeout(timeout);
    }
  }, [key, digits, period, algorithm, generateOTP]);

  useEffect(() => {
    if (remaining > 0) {
      const timer = setTimeout(() => setRemaining(remaining - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      const timeout = setTimeout(generateOTP, 0);
      return () => clearTimeout(timeout);
    }
  }, [remaining, generateOTP]);

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
              style={{ width: `${(remaining / period) * 100}%` }}
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
                        GET
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
