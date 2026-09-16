import { describe, expect, it } from 'vitest';
import { initialBreaker, type BreakerState } from '../../../src/core/breaker';
import { DEFAULT_BUDGET, HARD_MIN_DELAY_MS, PRESETS } from '../../../src/core/pacing';
import { decide, pacingDelayMs, type RunSnapshot } from '../../../src/core/scheduler';

const NOON = new Date(2026, 8, 17, 12, 0, 0).getTime();

function snap(over: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    pending: 100,
    deletedSoFar: 500,
    breaker: initialBreaker,
    budget: DEFAULT_BUDGET,
    remaining: null,
    preset: PRESETS.brisk,
    activeStartHour: 9,
    activeEndHour: 23,
    paused: false,
    ...over,
  };
}

describe('decide', () => {
  it('deletes when everything is clear', () => {
    expect(decide(snap(), NOON)).toEqual({ type: 'delete' });
  });

  it('stops when halted', () => {
    const breaker: BreakerState = { ...initialBreaker, status: 'halted', reason: '계정 잠금 감지' };
    expect(decide(snap({ breaker }), NOON)).toEqual({ type: 'stop', reason: '계정 잠금 감지' });
  });

  it('waits while cooling', () => {
    const breaker: BreakerState = { ...initialBreaker, status: 'cooling', until: NOON + 60_000 };
    const cmd = decide(snap({ breaker }), NOON);
    expect(cmd).toMatchObject({ type: 'wait', untilMs: NOON + 60_000 });
  });

  it('waits when paused', () => {
    expect(decide(snap({ paused: true }), NOON).type).toBe('wait');
  });

  it('is done when nothing is pending', () => {
    expect(decide(snap({ pending: 0 }), NOON)).toEqual({ type: 'done' });
  });

  it('waits outside active hours', () => {
    const at3am = new Date(2026, 8, 17, 3, 0, 0).getTime();
    const cmd = decide(snap(), at3am);
    expect(cmd).toMatchObject({ type: 'wait', reason: '활동 시간대 밖' });
  });

  it('waits for reset when observed budget is nearly spent', () => {
    const cmd = decide(snap({ remaining: 5, budget: { limit: 50, windowSec: 900 } }), NOON);
    expect(cmd).toMatchObject({ type: 'wait', reason: '예산 소진 — 창 리셋 대기' });
  });
});

describe('pacingDelayMs', () => {
  it('produces a delay at least the hard minimum', () => {
    expect(pacingDelayMs(snap(), () => 0.5)).toBeGreaterThanOrEqual(HARD_MIN_DELAY_MS);
  });
});
