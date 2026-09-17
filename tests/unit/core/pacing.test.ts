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

describe('rush — 폭주 프리셋 (ADR-0011)', () => {
  it('간격을 창 전체에 분산하지 않고 플로어 1초로 달린다', () => {
    expect(baseIntervalMs(PRESETS.rush)).toBe(1_000);
    // 예산이 아무리 빠듯해도 간격은 늘어나지 않는다. 대신 스케줄러가 리셋까지 멈춘다
    expect(baseIntervalMs(PRESETS.rush, { limit: 1, windowSec: 900 })).toBe(1_000);
  });

  it('하루 예상치는 간격이 아니라 창 예산으로 센다', () => {
    const measured = { limit: 60, windowSec: 900 };
    // 1초 간격만 세면 14시간에 50,400건이지만, 실제 상한은 창당 u·L = 57건
    expect(estimate(1, PRESETS.rush, measured).perDay).toBe(3_192);
    expect(estimate(1, PRESETS.rush, measured).intervalSec).toBe(1);
  });
});
