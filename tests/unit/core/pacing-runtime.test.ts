import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET,
  HARD_MIN_DELAY_MS,
  PRESETS,
  lognormalMultiplier,
  nextActiveStart,
  nextDelayMs,
  shouldWaitForReset,
  warmupUtil,
  withinActiveHours,
} from '../../../src/core/pacing';

describe('warmupUtil', () => {
  it('starts at 0.3 and ramps to the preset utilization', () => {
    expect(warmupUtil(PRESETS.brisk, 0)).toBe(0.3);
    expect(warmupUtil(PRESETS.brisk, 99)).toBe(0.3);
    expect(warmupUtil(PRESETS.brisk, 200)).toBeCloseTo(0.5, 5); // halfway 0.3→0.7
    expect(warmupUtil(PRESETS.brisk, 300)).toBe(0.7);
    expect(warmupUtil(PRESETS.brisk, 5000)).toBe(0.7);
  });
  it('rush는 워밍업 없이 처음부터 최대 사용률로 간다 (ADR-0011)', () => {
    expect(warmupUtil(PRESETS.rush, 0)).toBe(0.95);
  });
});

describe('lognormalMultiplier', () => {
  it('is 1.0 when the Box-Muller angle makes z=0 (u2=0.25)', () => {
    const seq = [0.5, 0.25];
    let i = 0;
    expect(lognormalMultiplier(() => seq[i++]!)).toBeCloseTo(1, 6);
  });
  it('stays positive across extremes', () => {
    expect(lognormalMultiplier(() => 0.001)).toBeGreaterThan(0);
    expect(lognormalMultiplier(() => 0.999)).toBeGreaterThan(0);
  });
});

describe('nextDelayMs', () => {
  it('never goes below the hard minimum', () => {
    const fast = { ...PRESETS.brisk, floorMs: 0 };
    const big = { limit: 100_000, windowSec: 900 };
    for (const r of [0.001, 0.25, 0.5, 0.75, 0.999]) {
      expect(nextDelayMs(fast, big, 500, () => r)).toBeGreaterThanOrEqual(HARD_MIN_DELAY_MS);
    }
  });
  it('adds a 20~40s rest when the 4% draw hits', () => {
    // rng sequence: u1, u2 for lognormal, then the 0.04 gate, then rest magnitude
    const seq = [0.5, 0.5, 0.01, 0.5];
    let i = 0;
    const rng = () => seq[i++ % seq.length]!;
    const base = nextDelayMs(PRESETS.brisk, DEFAULT_BUDGET, 500, () => [0.5, 0.5, 0.99][i++ % 3]!);
    i = 0;
    const ms = nextDelayMs(PRESETS.brisk, DEFAULT_BUDGET, 500, rng);
    expect(ms - base).toBeGreaterThanOrEqual(20_000);
    expect(ms - base).toBeLessThanOrEqual(40_000);
  });

  it('rush는 같은 난수에서도 긴 휴식을 붙이지 않는다 (ADR-0011)', () => {
    const draw = () => {
      const seq = [0.5, 0.5, 0.01, 0.5];
      let i = 0;
      return () => seq[i++ % seq.length]!;
    };
    expect(nextDelayMs(PRESETS.brisk, DEFAULT_BUDGET, 500, draw())).toBeGreaterThan(30_000);
    expect(nextDelayMs(PRESETS.rush, DEFAULT_BUDGET, 500, draw())).toBe(1_000);
  });
});

describe('shouldWaitForReset', () => {
  it('waits when remaining drops below the unused share', () => {
    expect(shouldWaitForReset(20, 50, 0.7)).toBe(false); // needs <15
    expect(shouldWaitForReset(10, 50, 0.7)).toBe(true);
  });
});

describe('active hours', () => {
  it('detects inside/outside the window', () => {
    const at = (h: number) => new Date(2026, 8, 17, h, 0, 0);
    expect(withinActiveHours(at(10), 9, 23)).toBe(true);
    expect(withinActiveHours(at(2), 9, 23)).toBe(false);
    expect(nextActiveStart(at(10), 9, 23)).toBeNull();
  });
  it('computes the next start time when outside', () => {
    const early = new Date(2026, 8, 17, 3, 0, 0);
    const start = nextActiveStart(early, 9, 23);
    expect(start).toBe(new Date(2026, 8, 17, 9, 0, 0).getTime());

    const late = new Date(2026, 8, 17, 23, 30, 0);
    const startNextDay = nextActiveStart(late, 9, 23);
    expect(startNextDay).toBe(new Date(2026, 8, 18, 9, 0, 0).getTime());
  });
});
