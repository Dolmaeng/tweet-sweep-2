import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUN_SETTINGS,
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

  it('0 이하 간격은 저장을 거부한다', () => {
    for (const bad of [0, -1, -0.5]) {
      const v = validateRunSettings({
        preset: 'brisk',
        activeStartHour: 9,
        activeEndHour: 23,
        floorSec: bad,
      });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.errors.join()).toContain('0보다 커야 합니다');
    }
  });

  it('숫자가 아니면 저장을 거부한다', () => {
    const v = validateRunSettings({
      preset: 'brisk',
      activeStartHour: 9,
      activeEndHour: 23,
      floorSec: '빠르게',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toContain('숫자여야 합니다');
  });

  it('0 초과 실수는 그대로 받는다 — 상한 없음', () => {
    for (const good of [0.3, '0.05', 1, 900]) {
      const v = validateRunSettings({
        preset: 'brisk',
        activeStartHour: 9,
        activeEndHour: 23,
        floorSec: good,
      });
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.floorSec).toBe(Number(good));
    }
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
    expect(coerceRunSettings({ floorSec: -1 })).toEqual(DEFAULT_RUN_SETTINGS);
    expect(coerceRunSettings({ activeStartHour: 0, activeEndHour: 24 })).toMatchObject({
      activeStartHour: 0,
      activeEndHour: 24,
    });
  });
});
