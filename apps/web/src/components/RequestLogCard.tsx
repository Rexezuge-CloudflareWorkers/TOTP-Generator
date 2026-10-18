import { Badge, Card, CardHeader, CardTitle } from '@rexezuge/web';
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { RequestLogEntry } from '../hooks/useTotpBatch';

/**
 * The last backend request, and the failure message when it had one.
 *
 * Rendered with a `key` of the request's timestamp by `App`: a new request
 * mounts a fresh component, which is what resets the expanded state without an
 * effect that sets it.
 */

export interface RequestLogCardProps {
  request: RequestLogEntry | null;
}

export function RequestLogCard({ request }: Readonly<RequestLogCardProps>): ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backend requests</CardTitle>
      </CardHeader>

      {request === null ? (
        <p className="text-sm text-[var(--color-text-muted)]">No requests yet.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] px-3 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 font-mono text-xs font-semibold text-[var(--color-text-muted)]">{request.method}</span>
              <span className="shrink-0 text-sm text-[var(--color-text-secondary)]">{request.label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-text-muted)]" title={request.url}>
                {request.url}
              </span>
            </span>
            <Badge variant={request.ok ? 'success' : 'error'} title={`HTTP status ${request.status}`}>
              {request.status}
            </Badge>
          </div>

          {!request.ok && request.errorMessage !== null && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                title="Show error message"
                className="w-full cursor-pointer rounded-md border border-[var(--color-error-bg)] px-3 py-1.5 text-left text-xs text-[var(--color-error-text)] hover:bg-[var(--color-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              >
                {expanded ? 'Hide error message' : 'Show error message'}
              </button>
              {expanded && (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-error-bg)] bg-[var(--color-error-bg)] p-2 font-mono text-xs text-[var(--color-error-text)]">
                  {request.errorMessage}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
