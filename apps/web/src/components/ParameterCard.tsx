import { Button, Card, CardHeader, CardTitle, Input, Label, Select } from '@rexezuge/web';
import { Wand2 } from 'lucide-react';
import type { ReactElement } from 'react';

/**
 * The parameter form.
 *
 * Controlled from `App`, which owns the parameter state and hands it to
 * `useTotpBatch` — the form itself does not know the API exists.
 */

export interface ParameterCardProps {
  secretKey: string;
  digits: number;
  period: number;
  algorithm: string;
  onSecretKeyChange: (value: string) => void;
  onDigitsChange: (value: number) => void;
  onPeriodChange: (value: number) => void;
  onAlgorithmChange: (value: string) => void;
  onGenerateKey: () => void;
}

/**
 * An empty or half-typed number field becomes 0 rather than `NaN`.
 *
 * `NaN` renders as an empty `<input>` that the state does not agree with, and
 * it serializes to `null` in the request body; 0 is a value the API rejects
 * with a message that names the field.
 */
function parseNumberInput(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function ParameterCard({
  secretKey,
  digits,
  period,
  algorithm,
  onSecretKeyChange,
  onDigitsChange,
  onPeriodChange,
  onAlgorithmChange,
  onGenerateKey,
}: Readonly<ParameterCardProps>): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parameters</CardTitle>
        <Button variant="secondary" size="sm" onClick={onGenerateKey}>
          <Wand2 size={14} aria-hidden="true" />
          Random key
        </Button>
      </CardHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="secret-key">Secret key</Label>
          <Input
            id="secret-key"
            type="text"
            value={secretKey}
            onChange={(event) => onSecretKeyChange(event.target.value)}
            placeholder="Enter a Base32 key"
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Base32, at least 16 characters. Whitespace is ignored by the API.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="digits">Digits</Label>
            <Input
              id="digits"
              type="number"
              min={6}
              max={8}
              value={digits}
              onChange={(event) => onDigitsChange(parseNumberInput(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="period">Period (seconds)</Label>
            <Input
              id="period"
              type="number"
              min={10}
              max={60}
              value={period}
              onChange={(event) => onPeriodChange(parseNumberInput(event.target.value))}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="algorithm">Algorithm</Label>
          <Select id="algorithm" value={algorithm} onChange={(event) => onAlgorithmChange(event.target.value)}>
            <option value="SHA-1">SHA-1</option>
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-512">SHA-512</option>
          </Select>
        </div>
      </div>
    </Card>
  );
}
