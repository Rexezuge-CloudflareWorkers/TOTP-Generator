import { AppPage, NoticeBar, PageHeaderCard } from '@rexezuge/web';
import { Timer } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { OtpCard } from './components/OtpCard';
import { ParameterCard } from './components/ParameterCard';
import { RequestLogCard } from './components/RequestLogCard';
import { useTotpBatch } from './hooks/useTotpBatch';
import { generateRandomKey } from './lib/otp';

function App(): ReactElement {
  const [key, setKey] = useState(generateRandomKey);
  const [digits, setDigits] = useState(6);
  const [period, setPeriod] = useState(30);
  const [algorithm, setAlgorithm] = useState('SHA-1');

  const { otps, remaining, request, autoRefresh, toggleAutoRefresh, notice } = useTotpBatch({ key, digits, period, algorithm });

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] text-[var(--color-text-primary)]">
      <NoticeBar notice={notice} statusLabels={{ success: 'Success', error: 'Error' }} />

      <AppPage variant="narrow">
        <PageHeaderCard
          icon={<Timer size={20} />}
          title="TOTP Generator"
          description="Generate, inspect and copy time-based one-time passwords from a Base32 secret."
        />

        <ParameterCard
          secretKey={key}
          digits={digits}
          period={period}
          algorithm={algorithm}
          onSecretKeyChange={setKey}
          onDigitsChange={setDigits}
          onPeriodChange={setPeriod}
          onAlgorithmChange={setAlgorithm}
          onGenerateKey={() => setKey(generateRandomKey())}
        />

        <OtpCard otps={otps} remaining={remaining} period={period} autoRefresh={autoRefresh} onToggleAutoRefresh={toggleAutoRefresh} />

        {/* Keyed on the request's timestamp: a new request mounts a fresh card,
            which is what collapses a previously expanded error. */}
        <RequestLogCard key={request?.timestamp ?? 0} request={request} />

        <p className="text-center text-xs text-[var(--color-text-muted)]">
          For more details on the API, see the{' '}
          <a href="/docs" target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline">
            OpenAPI documentation
          </a>
          .
        </p>
      </AppPage>
    </div>
  );
}

export default App;
