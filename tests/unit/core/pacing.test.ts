import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET,
  HARD_MAX_PER_DAY,
  HARD_MAX_UTIL,
  PRESETS,
  baseIntervalMs,
  estimate,
  nextDelayMs,
  warmupUtil,
  withCustomInterval,
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
  });
  it('never exceeds the hard utilization even if a preset asks for more', () => {
    const greedy = { ...PRESETS.brisk, utilization: 1, floorMs: 0 };
    const expected = (DEFAULT_BUDGET.windowSec * 1000) / (HARD_MAX_UTIL * DEFAULT_BUDGET.limit);
    expect(baseIntervalMs(greedy)).toBe(expected);
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

describe('withCustomInterval — 사용자 지정 간격 (ADR-0013)', () => {
  it('0.3초를 넣으면 실제로 300ms가 된다', () => {
    const custom = withCustomInterval(PRESETS.brisk, 0.3);
    expect(baseIntervalMs(custom)).toBe(300);
  });

  it('프리셋 플로어보다 작아도 묻히지 않는다 — Math.max로 묶으면 안 된다', () => {
    // 신중의 플로어는 30초다. 예전 구현은 max(30_000, 300)으로 지정값을 버렸다
    expect(baseIntervalMs(withCustomInterval(PRESETS.cautious, 0.3))).toBe(300);
  });

  it('예산 분산 산식을 건너뛴다 — 안 그러면 0.3을 넣어도 6.4초로 달린다', () => {
    const tight = { limit: 10, windowSec: 900 };
    // 분산 산식이면 W÷(u·L) = 900_000/(0.5·10) = 180초
    expect(baseIntervalMs(PRESETS.normal, tight)).toBe(180_000);
    expect(baseIntervalMs(withCustomInterval(PRESETS.normal, 0.3), tight)).toBe(300);
  });

  it('워밍업과 긴 휴식도 건너뛴다', () => {
    const custom = withCustomInterval(PRESETS.normal, 0.3);
    expect(warmupUtil(custom, 0)).toBe(PRESETS.normal.utilization);
    // 0.01 draw는 4% 긴 휴식 게이트를 통과시키는 값이다
    const seq = [0.5, 0.5, 0.01, 0.5];
    let i = 0;
    expect(nextDelayMs(custom, DEFAULT_BUDGET, 0, () => seq[i++ % seq.length]!)).toBe(300);
  });

  it('null이면 프리셋을 그대로 둔다', () => {
    expect(withCustomInterval(PRESETS.brisk, null)).toBe(PRESETS.brisk);
  });

  it('예산 사용률 u는 프리셋 것을 그대로 쓴다 — 속도만 바꾸지 예산 감시는 안 푼다', () => {
    const custom = withCustomInterval(PRESETS.cautious, 0.3);
    expect(custom.utilization).toBe(PRESETS.cautious.utilization);
  });
});

describe('estimate — 사용자 지정 간격', () => {
  it('느린 간격에서는 창 예산이 아니라 간격이 상한이다', () => {
    const measured = { limit: 200, windowSec: 900 };
    // 300초 간격이면 창(900초)당 3건. 예산(0.7·200=140)만 세면 47배 과대평가된다
    expect(estimate(1, withCustomInterval(PRESETS.brisk, 300), measured).perDay).toBe(168);
  });

  it('빠른 간격에서는 창 예산이 상한이다', () => {
    const measured = { limit: 200, windowSec: 900 };
    // 0.3초면 창당 3,000건까지 가능하지만 예산은 0.7·200 = 140건
    expect(estimate(1, withCustomInterval(PRESETS.brisk, 0.3), measured).perDay).toBe(7_840);
  });
});
