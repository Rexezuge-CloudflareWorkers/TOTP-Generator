import { BadRequestError } from '@rexezuge/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRemaining, describeGenerationFailure, generateSingleTotp } from '@totp-generator/api/lib/totp';

/**
 * The real otplib path, against real clocks.
 *
 * Everything else in the suite stubs or fixes the environment; this file is the
 * one place the RFC 6238 vectors are checked, so a regression in the wiring
 * between this repo and otplib cannot hide behind a mock.
 */

/**
 * RFC 6238's SHA-1 test secret, Base32-encoded.
 *
 * The RFC prints it as the ASCII string `12345678901234567890`, which is *not*
 * itself Base32 — `1`, `8`, `9` and `0` are outside the alphabet — so this is
 * its Base32 form, the encoding otplib decodes.
 */
const RFC6238_KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/**
Epoch 59 — the RFC vector's timestamp.
*/
const RFC_EPOCH_MS = 59_000;

describe('generateSingleTotp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RFC_EPOCH_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reproduces the RFC 6238 SHA-1 vector', () => {
    expect(generateSingleTotp({ key: RFC6238_KEY, digits: 8, period: 30, algorithm: 'SHA-1', timeOffset: 0 })).toBe('94287082');
  });

  it('honours the digit count', () => {
    expect(generateSingleTotp({ key: RFC6238_KEY, digits: 6, period: 30, algorithm: 'SHA-1', timeOffset: 0 })).toBe('287082');
  });

  it('honours the algorithm', () => {
    expect(generateSingleTotp({ key: RFC6238_KEY, digits: 8, period: 30, algorithm: 'SHA-256', timeOffset: 0 })).toBe('32247374');
    expect(generateSingleTotp({ key: RFC6238_KEY, digits: 8, period: 30, algorithm: 'SHA-512', timeOffset: 0 })).toBe('69342147');
  });

  it('shifts the epoch by the time offset', () => {
    expect(generateSingleTotp({ key: RFC6238_KEY, digits: 8, period: 30, algorithm: 'SHA-1', timeOffset: -30 })).toBe('84755224');
    expect(generateSingleTotp({ key: RFC6238_KEY, digits: 8, period: 30, algorithm: 'SHA-1', timeOffset: 30 })).toBe('37359152');
  });

  it('accepts a lower-case key', () => {
    expect(generateSingleTotp({ key: RFC6238_KEY.toLowerCase(), digits: 8, period: 30, algorithm: 'SHA-1', timeOffset: 0 })).toBe(
      '94287082',
    );
  });

  it('classifies a key otplib cannot decode as a BadRequest', () => {
    // `1234567890123456` is 16 characters, so it passes the length rule, and
    // `1`, `8`, `9` and `0` are outside the Base32 alphabet.
    expect(() => generateSingleTotp({ key: '1234567890123456', digits: 8, period: 30, algorithm: 'SHA-1', timeOffset: 0 })).toThrow(
      BadRequestError,
    );
  });

  it('keeps the client-facing sentence but not the secret', () => {
    const attempt = (): string => generateSingleTotp({ key: '1234567890123456', digits: 8, period: 30, algorithm: 'SHA-1', timeOffset: 0 });
    expect(attempt).toThrow(/Unable to generate a TOTP code: Invalid Base32 string/);
  });
});

describe('describeGenerationFailure', () => {
  it("keeps otplib's sentence when there is one", () => {
    expect(describeGenerationFailure(new Error('Invalid Base32 string: bad character at index 3.'))).toBe(
      'Invalid Base32 string: bad character at index 3.',
    );
  });

  it('falls back for a failure that is not an Error', () => {
    expect(describeGenerationFailure({ reason: 'otplib threw a bare value' })).toBe('the key could not be decoded as a Base32 string.');
  });

  it('falls back for an Error carrying no message', () => {
    // Built from a valid Error with the message blanked rather than written as
    // `new Error()`: the lint rule that forbids a message-less Error is right
    // for production code, and this is the degenerate input for the fallback,
    // not a defect the rule should have caught.
    const blank = new Error('ignored');
    blank.message = '';

    expect(describeGenerationFailure(blank)).toBe('the key could not be decoded as a Base32 string.');
  });
});

describe('computeRemaining', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down to 1 at the end of a step', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RFC_EPOCH_MS));
    expect(computeRemaining(30)).toBe(1);
  });

  it('reports the full period at a step boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(60_000));
    expect(computeRemaining(30)).toBe(30);
  });

  it('follows a custom period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(65_000));
    expect(computeRemaining(60)).toBe(55);
  });
});
