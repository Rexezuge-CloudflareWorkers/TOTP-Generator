import { Button, Card, CardHeader, CardTitle, useCopyToClipboard } from '@rexezuge/web';
import { Check, Copy } from 'lucide-react';
import type { ReactElement } from 'react';
import type { TotpBatch } from '../hooks/useTotpBatch';
import { getSafePeriod, PLACEHOLDER_OTP } from '../lib/otp';

/**
 * The codes themselves: the current one with its copy action, the neighbours,
 * and the countdown that turns the progress bar into the auto-refresh switch.
 */

export interface OtpCardProps {
  otps: TotpBatch;
  remaining: number;
  period: number;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
}

export function OtpCard({ otps, remaining, period, autoRefresh, onToggleAutoRefresh }: Readonly<OtpCardProps>): ReactElement {
  const { copied, copy } = useCopyToClipboard();
  const periodSeconds = getSafePeriod(period);
  const percent = Math.min(100, Math.max(0, (remaining / periodSeconds) * 100));
  const ready = otps.current !== PLACEHOLDER_OTP;

  return (
    <Card>
      <CardHeader>
        <CardTitle>One-time password</CardTitle>
        <span className="font-mono text-xs text-[var(--color-text-muted)]">T = {periodSeconds}s</span>
      </CardHeader>

      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="font-mono text-4xl font-semibold tracking-[0.2em] text-[var(--color-accent)]">{otps.current}</span>
          <Button variant="secondary" size="sm" onClick={() => copy(otps.current)} disabled={!ready}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="mt-4 flex justify-center gap-8 text-sm text-[var(--color-text-secondary)]">
          <p>
            Previous: <span className="font-mono text-base">{otps.previous}</span>
          </p>
          <p>
            Next: <span className="font-mono text-base">{otps.next}</span>
          </p>
        </div>
      </div>

      <div className="mt-5">
        <button
          type="button"
          role="switch"
          aria-checked={autoRefresh}
          aria-label="Toggle auto-refresh on countdown"
          title={autoRefresh ? 'Auto-refresh ON — click to pause' : 'Auto-refresh paused — click to resume'}
          onClick={onToggleAutoRefresh}
          className="block w-full cursor-pointer rounded-full py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <span className="block h-3 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
            <span
              className={`block h-full transition-all duration-1000 ease-linear ${
                autoRefresh ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-text-muted)]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </span>
        </button>

        <p className="mt-2 text-center text-sm text-[var(--color-text-secondary)]">
          Time left: <span className="font-semibold text-[var(--color-text-primary)]">{remaining}</span>s
          {!autoRefresh && <span className="ml-1 text-[var(--color-text-muted)]">(paused)</span>}
        </p>
        <p className="mt-1 text-center text-xs text-[var(--color-text-muted)]" aria-live="polite">
          {autoRefresh
            ? 'Auto-refresh on — click the progress bar to pause.'
            : 'Auto-refresh paused — click the progress bar to resume. Editing the key or options still refreshes.'}
        </p>
      </div>
    </Card>
  );
}
