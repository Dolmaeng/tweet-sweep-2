// 적응형 페이싱의 기본 산식 (SRS §6, ADR-0007). M1은 예상 소요 계산만, 지터·워밍업·예산 추적은 T21.
import type { PresetName } from './models';

export interface PresetSpec {
  name: PresetName;
  /** 관측 예산 사용률 u (0~HARD_MAX_UTIL) */
  utilization: number;
  /** 간격 하한(ms). 사용자 지정 구간 */
  floorMs: number;
  label: string;
}

export interface RateBudget {
  /** x-rate-limit-limit */
  limit: number;
  /** 창 길이(초). x-rate-limit-reset 간격, 보통 900 */
  windowSec: number;
}

/** 하드 제약. 설정으로 초과 불가 (헌장 P1) */
export const HARD_MIN_DELAY_MS = 10_000;
export const HARD_MAX_UTIL = 0.7;
export const HARD_MAX_PER_DAY = 5_000;

/** 헤더를 아직 관측하지 못했을 때의 가정 (공식 API 삭제 한도와 동일) */
export const DEFAULT_BUDGET: RateBudget = { limit: 50, windowSec: 900 };
export const UNOBSERVED_UTIL = 0.3;
export const DEFAULT_ACTIVE_HOURS = 14;

export const PRESETS: Record<PresetName, PresetSpec> = {
  cautious: { name: 'cautious', utilization: 0.3, floorMs: 30_000, label: '신중' },
  normal: { name: 'normal', utilization: 0.5, floorMs: 18_000, label: '보통' },
  brisk: { name: 'brisk', utilization: 0.7, floorMs: 10_000, label: '빠름' },
};

export const DEFAULT_PRESET: PresetName = 'brisk';

/** 기본 간격(ms) = max(플로어, 하드 최소, W ÷ (u·L)) */
export function baseIntervalMs(preset: PresetSpec, budget: RateBudget = DEFAULT_BUDGET): number {
  const u = Math.min(preset.utilization, HARD_MAX_UTIL);
  const fromBudget = (budget.windowSec * 1000) / (u * budget.limit);
  return Math.max(preset.floorMs, HARD_MIN_DELAY_MS, fromBudget);
}

export interface Estimate {
  intervalSec: number;
  perDay: number;
  days: number;
}

export function estimate(
  targetCount: number,
  preset: PresetSpec,
  budget: RateBudget = DEFAULT_BUDGET,
  activeHours: number = DEFAULT_ACTIVE_HOURS,
): Estimate {
  const intervalMs = baseIntervalMs(preset, budget);
  const perDay = Math.min(HARD_MAX_PER_DAY, Math.floor((activeHours * 3600 * 1000) / intervalMs));
  return {
    intervalSec: Math.round(intervalMs / 1000),
    perDay,
    days: perDay === 0 ? Infinity : Math.ceil(targetCount / perDay),
  };
}
