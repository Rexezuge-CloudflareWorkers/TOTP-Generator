/**
 * The TOTP SPA's pure helpers.
 *
 * Kept out of the components so the arithmetic — which decides what a user
 * sees and when the next fetch happens — is testable without a DOM.
 */

/**
 * The Base32 alphabet (RFC 4648, no padding): the character set otplib decodes
 * and therefore the only one a generated key may contain.
 */
export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * The default step, in seconds — the value every authenticator app assumes.
 */
export const DEFAULT_PERIOD = 30;

/**
 * How many characters a generated key carries.
 *
 * 16 Base32 characters is 80 bits, and it is also the API's minimum accepted
 * key length, so a generated key can never be rejected for being short.
 */
export const KEY_LENGTH = 16;

/**
 * What the display shows before the first response arrives.
 */
export const PLACEHOLDER_OTP = '------';

const AUTO_REFRESH_STORAGE_KEY = 'totp-generator:auto-refresh';

/**
 * A fresh random key.
 *
 * `crypto.getRandomValues` rather than `Math.random`: this string becomes the
 * shared secret for whatever account it is enrolled on, and `Math.random` is
 * not a cryptographic source. The modulo bias across a 32-character alphabet
 * from a byte is exactly zero, so every character is uniform.
 */
export function generateRandomKey(length: number = KEY_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => BASE32_ALPHABET.charAt(byte % BASE32_ALPHABET.length)).join('');
}

/**
 * A period that can be divided by without exploding.
 *
 * The number inputs hand through whatever the user typed before validation —
 * including `0` and `NaN` — and a `% 0` is `NaN`, which renders as an empty
 * countdown rather than an error.
 */
export function getSafePeriod(periodSeconds: number): number {
  return Number.isFinite(periodSeconds) && periodSeconds > 0 ? Math.floor(periodSeconds) : DEFAULT_PERIOD;
}

/**
 * The seconds left in the current step, between 1 and the period.
 *
 * Recomputed from `nowMs` rather than decremented: an interval that fires late
 * (a throttled background tab) cannot accumulate drift, because there is no
 * accumulated state to drift.
 */
export function getRemaining(periodSeconds: number, nowMs: number = Date.now()): number {
  const safePeriod = getSafePeriod(periodSeconds);
  const nowSeconds = Math.floor(nowMs / 1000);
  return Math.min(Math.max(safePeriod - (nowSeconds % safePeriod), 1), safePeriod);
}

/**
 * The step number the clock is currently in.
 *
 * Two calls with the same period return the same value until the step rolls
 * over, which is what makes "did the step change?" a comparison rather than a
 * timer.
 */
export function getCounter(periodSeconds: number, nowMs: number = Date.now()): number {
  return Math.floor(Math.floor(nowMs / 1000) / getSafePeriod(periodSeconds));
}

/**
 * The offsets the SPA asks for: previous step, current, next.
 */
export function buildOffsets(periodSeconds: number): number[] {
  const safePeriod = getSafePeriod(periodSeconds);
  return [-safePeriod, 0, safePeriod];
}

/**
 * Whether auto-refresh was left on, defaulting to on.
 *
 * Storage can throw (private mode, blocked cookies), so every access is
 * guarded; a preference that cannot be read is not an error the page should
 * surface.
 */
export function readAutoRefreshPreference(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // Fall through to the default.
  }
  return true;
}

export function writeAutoRefreshPreference(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(enabled));
  } catch {
    // The app works without persistence.
  }
}
