import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET,
  HARD_MAX_PER_DAY,
  HARD_MAX_UTIL,
  HARD_MIN_DELAY_MS,
  PRESETS,
  baseIntervalMs,
  estimate,
} from '../../../src/core/pacing';

describe('baseIntervalMs', () => {
  it('matches the SRS §6 table for the unobserved budget (L=50, W=900)', () => {
    expect(Math.round(baseIntervalMs(PRESETS.cautious) / 1000)).toBe(60);
    expect(Math.round(baseIntervalMs(PRESETS.normal) / 1000)).toBe(36);
    expect(Math.round(baseIntervalMs(PRESETS.brisk) / 1000)).toBe(26);
  });
  it('drops toward the preset floor when the observed limit grows', () => {
    const l100 = { limit: 100, windowSec: 900 };
    expect(Math.round(baseIntervalMs(PRESETS.brisk, l100) / 1000)).toBe(13);
    const l1000 = { limit: 1000, windowSec: 900 };
    expect(baseIntervalMs(PRESETS.brisk, l1000)).toBe(PRESETS.brisk.floorMs);
    expect(baseIntervalMs(PRESETS.brisk, l1000)).toBeGreaterThanOrEqual(HARD_MIN_DELAY_MS);
  });
  it('never exceeds the hard utilization even if a preset asks for more', () => {
    const greedy = { ...PRESETS.brisk, utilization: 1, floorMs: 0 };
    const expected = (DEFAULT_BUDGET.windowSec * 1000) / (HARD_MAX_UTIL * DEFAULT_BUDGET.limit);
    expect(baseIntervalMs(greedy)).toBe(Math.max(expected, HARD_MIN_DELAY_MS));
  });
});

describe('estimate', () => {
  it('derives per-day capacity and days from the interval', () => {
    const e = estimate(30_000, PRESETS.brisk);
    expect(e.intervalSec).toBe(26);
    expect(e.perDay).toBe(1960);
    expect(e.days).toBe(16);
    expect(estimate(0, PRESETS.brisk).days).toBe(0);
  });
  it('caps per-day at the absolute limit', () => {
    const huge = { limit: 100_000, windowSec: 900 };
    expect(estimate(1, PRESETS.brisk, huge).perDay).toBe(HARD_MAX_PER_DAY);
  });
});
