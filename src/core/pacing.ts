// 적응형 페이싱 (SRS §6, ADR-0007): 예상 소요 산식 + 런타임 지터·워밍업·예산 감시.
import type { PresetName, Rng } from './models';

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

/** 하드 제약. 설정으로 초과 불가 (헌장 P1). 수치는 ADR-0008(실측 L=200/15min 기준) */
export const HARD_MIN_DELAY_MS = 5_000;
export const HARD_MAX_UTIL = 0.7;
export const HARD_MAX_PER_DAY = 8_000;

/** 헤더를 아직 관측하지 못했을 때의 가정 (공식 API 삭제 한도와 동일) */
export const DEFAULT_BUDGET: RateBudget = { limit: 50, windowSec: 900 };
export const UNOBSERVED_UTIL = 0.3;
export const DEFAULT_ACTIVE_HOURS = 14;

export const PRESETS: Record<PresetName, PresetSpec> = {
  cautious: { name: 'cautious', utilization: 0.3, floorMs: 30_000, label: '신중' },
  normal: { name: 'normal', utilization: 0.5, floorMs: 18_000, label: '보통' },
  brisk: { name: 'brisk', utilization: 0.7, floorMs: 5_000, label: '빠름' },
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

// ── 런타임 페이싱 (ADR-0007): 워밍업·로그노멀 지터·긴 휴식·활동 시간·예산 감시 ──

/** 워밍업: 첫 100건 u=0.3(측정 겸), 다음 200건 동안 프리셋 u까지 선형 상승 */
export function warmupUtil(preset: PresetSpec, deletedSoFar: number): number {
  const target = Math.min(preset.utilization, HARD_MAX_UTIL);
  const start = Math.min(UNOBSERVED_UTIL, target);
  if (deletedSoFar < 100) return start;
  if (deletedSoFar < 300) return start + (target - start) * ((deletedSoFar - 100) / 200);
  return target;
}

/** 중앙값 1.0의 로그노멀 배수. 오른쪽 꼬리가 긴 사람형 분포 */
export function lognormalMultiplier(rng: Rng, sigma = 0.35): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(sigma * z);
}

/** 다음 삭제까지 대기(ms). 워밍업 u + 로그노멀 지터 + 4% 확률 2~8분 긴 휴식 */
export function nextDelayMs(
  preset: PresetSpec,
  budget: RateBudget,
  deletedSoFar: number,
  rng: Rng = Math.random,
): number {
  const u = Math.min(warmupUtil(preset, deletedSoFar), HARD_MAX_UTIL);
  const base = Math.max(
    preset.floorMs,
    HARD_MIN_DELAY_MS,
    (budget.windowSec * 1000) / (u * budget.limit),
  );
  let ms = base * lognormalMultiplier(rng);
  if (rng() < 0.04) ms += (120 + rng() * 360) * 1000;
  return Math.max(HARD_MIN_DELAY_MS, Math.round(ms));
}

/** 잔여 예산이 (1−u)·L 아래면 창 리셋까지 기다린다(429 선제 회피, SRS §6) */
export function shouldWaitForReset(remaining: number, limit: number, utilization: number): boolean {
  return remaining < (1 - Math.min(utilization, HARD_MAX_UTIL)) * limit;
}

/** 로컬 시각이 활동 시간대 안인가. start<end 가정(예: 9~23) */
export function withinActiveHours(date: Date, startHour: number, endHour: number): boolean {
  const h = date.getHours() + date.getMinutes() / 60;
  return h >= startHour && h < endHour;
}

/** 활동 시간대 밖이면 다음 시작 시각(ms epoch), 안이면 null */
export function nextActiveStart(date: Date, startHour: number, endHour: number): number | null {
  if (withinActiveHours(date, startHour, endHour)) return null;
  const next = new Date(date);
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= endHour) next.setDate(next.getDate() + 1);
  next.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0);
  return next.getTime();
}
