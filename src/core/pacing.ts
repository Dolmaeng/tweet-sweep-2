// 적응형 페이싱 (SRS §6, ADR-0007): 예상 소요 산식 + 런타임 지터·워밍업·예산 감시.
import type { PresetName, Rng } from './models';

export interface PresetSpec {
  name: PresetName;
  /** 관측 예산 사용률 u (0~HARD_MAX_UTIL) */
  utilization: number;
  /** 간격 하한(ms). 사용자 지정 구간 */
  floorMs: number;
  label: string;
  /**
   * 폭주 모드 (ADR-0011). 간격을 창 전체에 분산하지 않고 플로어로 달린다.
   * 워밍업과 4% 긴 휴식도 건너뛴다. 창 예산이 바닥나면 스케줄러가 리셋까지 멈춘다.
   */
  burst?: boolean;
}

export interface RateBudget {
  /** x-rate-limit-limit */
  limit: number;
  /** 창 길이(초). x-rate-limit-reset 간격, 보통 900 */
  windowSec: number;
}

/**
 * 하드 제약. 설정으로 초과 불가 (헌장 P1). 실측 L=200/15min 기준(ADR-0008).
 *
 * 간격 하한은 더 이상 없다. 사용자가 정지 위험을 알고 직접 정하겠다고 요구했다(ADR-0013).
 * 0보다 크기만 하면 된다 — 그 검증은 core/settings.ts가 한다.
 * 예산 사용률과 일일 총량 상한은 남는다. 이 둘은 속도가 아니라 429·헤더 오독을 막는 장치다.
 */
export const HARD_MAX_UTIL = 0.95;
export const HARD_MAX_PER_DAY = 8_000;

/** 헤더를 아직 관측하지 못했을 때의 가정 (공식 API 삭제 한도와 동일) */
export const DEFAULT_BUDGET: RateBudget = { limit: 50, windowSec: 900 };
export const UNOBSERVED_UTIL = 0.3;
export const DEFAULT_ACTIVE_HOURS = 14;

export const PRESETS: Record<PresetName, PresetSpec> = {
  cautious: { name: 'cautious', utilization: 0.3, floorMs: 30_000, label: '신중' },
  normal: { name: 'normal', utilization: 0.5, floorMs: 18_000, label: '보통' },
  brisk: { name: 'brisk', utilization: 0.7, floorMs: 5_000, label: '빠름' },
  rush: { name: 'rush', utilization: 0.95, floorMs: 1_000, label: '질주(1초)', burst: true },
};

export const DEFAULT_PRESET: PresetName = 'brisk';

/** 화면 표시 순서(느린 것부터) */
export const PRESET_ORDER: PresetName[] = ['cautious', 'normal', 'brisk', 'rush'];

/** 프리셋이 스스로 정한 최소 간격. 지터도 이 아래로는 내려가지 않는다 */
export function floorMsOf(preset: PresetSpec): number {
  return preset.floorMs;
}

/**
 * 사용자 지정 간격(ADR-0013). 있으면 프리셋 대신 이 값이 곧 간격이 된다.
 *
 * 플로어만 갈아끼우면 안 된다. 분산 산식 W÷(u·L)이 더 크면 Math.max에 걸려
 * 0.3초를 넣어도 6.4초로 달린다 — ADR-0011에서 프리셋 플로어만 낮췄을 때와 같은 함정이다.
 * 그래서 burst를 함께 켜 분산·워밍업·긴 휴식을 건너뛴다. 프리셋은 예산 사용률 u만 남긴다.
 */
export function withCustomInterval(base: PresetSpec, sec: number | null): PresetSpec {
  if (sec === null) return base;
  return { ...base, floorMs: sec * 1000, burst: true, label: `사용자 지정(${sec}초)` };
}

/** 기본 간격(ms) = max(플로어, W ÷ (u·L)). 폭주 모드는 분산하지 않고 플로어 */
export function baseIntervalMs(preset: PresetSpec, budget: RateBudget = DEFAULT_BUDGET): number {
  const floor = floorMsOf(preset);
  if (preset.burst) return floor;
  const u = Math.min(preset.utilization, HARD_MAX_UTIL);
  return Math.max(floor, (budget.windowSec * 1000) / (u * budget.limit));
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
  // 폭주 모드는 창 예산과 간격 둘 다에 걸린다. 예산만 세면 느린 사용자 지정 간격에서,
  // 간격만 세면 빠른 간격에서 과대평가된다(리셋 대기를 빼먹는다)
  const byInterval = (budget.windowSec * 1000) / intervalMs;
  const perWindow = preset.burst
    ? Math.min(Math.min(preset.utilization, HARD_MAX_UTIL) * budget.limit, byInterval)
    : byInterval;
  const windows = (activeHours * 3600) / budget.windowSec;
  const perDay = Math.min(HARD_MAX_PER_DAY, Math.floor(perWindow * windows));
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
  // 폭주 모드는 워밍업하지 않는다. 속도를 위해 위험을 받아들인 선택이다(ADR-0011)
  if (preset.burst) return target;
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

/** 다음 삭제까지 대기(ms). 워밍업 u + 로그노멀 지터 + 4% 확률 20~40초 짧은 휴식(사용자 조정, 원래 2~8분) */
export function nextDelayMs(
  preset: PresetSpec,
  budget: RateBudget,
  deletedSoFar: number,
  rng: Rng = Math.random,
): number {
  const floor = floorMsOf(preset);
  const u = Math.min(warmupUtil(preset, deletedSoFar), HARD_MAX_UTIL);
  const base = preset.burst
    ? floor
    : Math.max(floor, (budget.windowSec * 1000) / (u * budget.limit));
  let ms = base * lognormalMultiplier(rng);
  // 긴 휴식은 사람처럼 보이려는 장치다. 폭주 모드는 그 위장을 포기했고, 1초 간격에서 비용이 너무 크다
  if (!preset.burst && rng() < 0.04) ms += (20 + rng() * 20) * 1000;
  return Math.max(floor, Math.round(ms));
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
