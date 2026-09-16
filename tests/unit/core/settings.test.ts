import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUN_SETTINGS,
  HARD_MIN_FLOOR_SEC,
  coerceRunSettings,
  validateRunSettings,
} from '../../../src/core/settings';

describe('validateRunSettings', () => {
  it('accepts defaults and 24h window', () => {
    const v = validateRunSettings({ ...DEFAULT_RUN_SETTINGS, floorSec: '' });
    expect(v.ok).toBe(true);
    const all = validateRunSettings({
      preset: 'brisk',
      activeStartHour: '0',
      activeEndHour: '24',
      floorSec: null,
    });
    expect(all).toEqual({
      ok: true,
      value: { preset: 'brisk', activeStartHour: 0, activeEndHour: 24, floorSec: null },
    });
  });

  it('rejects floor below the hard minimum (cannot be saved)', () => {
    const v = validateRunSettings({
      preset: 'brisk',
      activeStartHour: 9,
      activeEndHour: 23,
      floorSec: HARD_MIN_FLOOR_SEC - 1,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toContain('하드 제약');
  });

  it('rejects inverted or out-of-range hours and unknown preset', () => {
    const v = validateRunSettings({
      preset: 'turbo',
      activeStartHour: 23,
      activeEndHour: 9,
      floorSec: null,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.length).toBe(2);
    expect(
      validateRunSettings({
        preset: 'brisk',
        activeStartHour: -1,
        activeEndHour: 25,
        floorSec: null,
      }).ok,
    ).toBe(false);
    expect(
      validateRunSettings({
        preset: 'brisk',
        activeStartHour: 9.5,
        activeEndHour: 23,
        floorSec: null,
      }).ok,
    ).toBe(false);
  });

  it('coerces corrupt stored values to defaults', () => {
    expect(coerceRunSettings(undefined)).toEqual(DEFAULT_RUN_SETTINGS);
    expect(coerceRunSettings({ floorSec: 1 })).toEqual(DEFAULT_RUN_SETTINGS);
    expect(coerceRunSettings({ activeStartHour: 0, activeEndHour: 24 })).toMatchObject({
      activeStartHour: 0,
      activeEndHour: 24,
    });
  });
});
