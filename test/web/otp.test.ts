import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOffsets,
  generateRandomKey,
  getCounter,
  getRemaining,
  getSafePeriod,
  KEY_LENGTH,
  readAutoRefreshPreference,
  writeAutoRefreshPreference,
} from '../../apps/web/src/lib/otp';

/**
 * The SPA's arithmetic and its one persisted preference — the decisions the
 * components only render. No DOM, no React: every value here is a function of
 * the clock the test hands in.
 */

const STORAGE_KEY = 'totp-generator:auto-refresh';

describe('generateRandomKey', () => {
  it('returns a 16-character Base32 string by default', () => {
    expect(generateRandomKey()).toMatch(/^[A-Z2-7]{16}$/);
    expect(generateRandomKey()).toHaveLength(KEY_LENGTH);
  });

  it('honours a custom length', () => {
    expect(generateRandomKey(8)).toHaveLength(8);
  });

  it('returns a different key every call', () => {
    expect(generateRandomKey()).not.toBe(generateRandomKey());
  });
});

describe('getSafePeriod', () => {
  it.each([
    [0, 30],
    [-5, 30],
    [NaN, 30],
    [Infinity, 30],
    [30, 30],
    [30.7, 30],
    [60, 60],
  ])('maps %s to %s', (input, expected) => {
    expect(getSafePeriod(input)).toBe(expected);
  });
});

describe('getRemaining', () => {
  it('counts down to 1 at the end of a step', () => {
    expect(getRemaining(30, 59_000)).toBe(1);
  });

  it('reports the full period at a step boundary', () => {
    expect(getRemaining(30, 0)).toBe(30);
    expect(getRemaining(30, 60_000)).toBe(30);
  });

  it('counts the middle of a step', () => {
    expect(getRemaining(30, 31_000)).toBe(29);
  });

  it('falls back to the default period for an unusable one', () => {
    expect(getRemaining(0, 59_000)).toBe(1);
  });

  it('reads the ambient clock when none is given', () => {
    expect(getRemaining(30)).toBeGreaterThan(0);
    expect(getRemaining(30)).toBeLessThanOrEqual(30);
  });
});

describe('getCounter', () => {
  it('advances once per step', () => {
    expect(getCounter(30, 0)).toBe(0);
    expect(getCounter(30, 29_999)).toBe(0);
    expect(getCounter(30, 30_000)).toBe(1);
    expect(getCounter(30, 59_999)).toBe(1);
  });

  it('reads the ambient clock when none is given', () => {
    expect(getCounter(30)).toBeGreaterThan(0);
  });
});

describe('buildOffsets', () => {
  it('asks for the previous, current and next steps', () => {
    expect(buildOffsets(30)).toEqual([-30, 0, 30]);
    expect(buildOffsets(60)).toEqual([-60, 0, 60]);
  });

  it('uses the default period for an unusable one', () => {
    expect(buildOffsets(0)).toEqual([-30, 0, 30]);
  });
});

describe('the auto-refresh preference', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to on', () => {
    expect(readAutoRefreshPreference()).toBe(true);
  });

  it('round-trips what was written', () => {
    writeAutoRefreshPreference(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
    expect(readAutoRefreshPreference()).toBe(false);

    writeAutoRefreshPreference(true);
    expect(readAutoRefreshPreference()).toBe(true);
  });

  it('ignores a value it did not write', () => {
    localStorage.setItem(STORAGE_KEY, 'maybe');
    expect(readAutoRefreshPreference()).toBe(true);
  });

  it('falls back to the default when storage refuses to read', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(readAutoRefreshPreference()).toBe(true);

    getItem.mockRestore();
  });

  it('swallows a storage that refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => writeAutoRefreshPreference(false)).not.toThrow();

    setItem.mockRestore();
  });
});
