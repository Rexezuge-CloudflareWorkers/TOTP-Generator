import { BadRequestError } from '@rexezuge/errors';
import { createGuardrails, generateSync } from 'otplib';

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export type GenerateTotpOptions = {
  key: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  timeOffset: number;
};

type OtplibAlgorithm = 'sha1' | 'sha256' | 'sha512';

/**
 * otplib spells the same three algorithms without the dash and in lower case.
 *
 * A map rather than the `algorithm.replace('-', '').toLowerCase()` this file
 * used to build: the cast that followed it asserted a shape the string
 * manipulation could not guarantee, and an invalid algorithm would have reached
 * otplib as an unsound `as`.
 */
const OTPLIB_ALGORITHMS: Record<TotpAlgorithm, OtplibAlgorithm> = {
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-512': 'sha512',
};

/**
 * otplib's default guardrails refuse a secret shorter than 32 bytes, which is
 * the RFC 4226 recommendation and roughly twice length of the Base32 keys
 * authenticator apps hand out. This API accepts keys from 16 characters, so the
 * floor is lowered to one byte; the 16-character minimum is enforced where every
 * other parameter is, in the request schema.
 */
const GUARDRAILS = createGuardrails({ MIN_SECRET_BYTES: 1 });

/**
 * otplib's own sentence when it raised one, and a sentence of this file's when
 * it did not.
 *
 * Exported because the fallback is unreachable through `generateSingleTotp`:
 * otplib only throws `Error`s with messages, so the branch is exercised by
 * calling this directly rather than by replacing the resolver in a test that
 * would then be asserting its own mock.
 */
export function describeGenerationFailure(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'the key could not be decoded as a Base32 string.';
}

/**
 * Generate one TOTP code at `now + timeOffset`.
 *
 * otplib refuses anything it cannot decode as Base32 — a caller error, not a
 * server fault — so every failure it raises is wrapped as a `BadRequestError`.
 * The wire status is therefore 400 and the otplib sentence (which names the
 * offending character) survives into the message. Without this, the same key
 * was a 400 or a masked 500 depending on which words the otplib message
 * happened to contain.
 */
export function generateSingleTotp({ key, digits, period, algorithm, timeOffset }: GenerateTotpOptions): string {
  const adjustedEpoch = Math.floor((Date.now() + timeOffset * 1000) / 1000);

  try {
    return generateSync({
      secret: key,
      digits,
      period,
      algorithm: OTPLIB_ALGORITHMS[algorithm],
      epoch: adjustedEpoch,
      guardrails: GUARDRAILS,
    });
  } catch (error: unknown) {
    throw new BadRequestError(`Unable to generate a TOTP code: ${describeGenerationFailure(error)}`);
  }
}

/**
 * The seconds left in the current step, counting down from `period` to 1.
 *
 * Never reports 0: a client that renders `0` as "expired" would show a code as
 * dead at the instant it is the only valid one.
 */
export function computeRemaining(period: number): number {
  const currentTime = Math.floor(Date.now() / 1000);
  return period - (currentTime % period);
}
