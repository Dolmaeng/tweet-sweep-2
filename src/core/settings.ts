// 실행 설정 (FR-14). 순수 검증: 하드 제약(헌장 P1, pacing.ts)을 넘는 값은 저장 자체를 거부한다.
import type { PresetName } from './models';
import { PRESETS } from './pacing';

export interface RunSettings {
  preset: PresetName;
  /** 활동 시간대 시작(0~23, 정수) */
  activeStartHour: number;
  /** 활동 시간대 끝(1~24, 정수). 24 = 자정까지 */
  activeEndHour: number;
  /**
   * 삭제 간격(초) 사용자 지정. null이면 프리셋을 따른다.
   * 0보다 크기만 하면 되고 실수도 된다(0.3 → 0.3초). 상한은 없다 (ADR-0013).
   */
  floorSec: number | null;
}

export const DEFAULT_RUN_SETTINGS: RunSettings = {
  preset: 'brisk',
  activeStartHour: 9,
  activeEndHour: 23,
  floorSec: null,
};

export type Validation = { ok: true; value: RunSettings } | { ok: false; errors: string[] };

/** 문자열·숫자 혼합 입력을 받아 검증한다. 오류가 하나라도 있으면 저장 불가 */
export function validateRunSettings(input: {
  preset: string;
  activeStartHour: number | string;
  activeEndHour: number | string;
  floorSec: number | string | null | '';
}): Validation {
  const errors: string[] = [];

  const preset = input.preset as PresetName;
  if (!(preset in PRESETS)) errors.push('프리셋이 올바르지 않습니다');

  const start = Number(input.activeStartHour);
  const end = Number(input.activeEndHour);
  if (!Number.isInteger(start) || start < 0 || start > 23)
    errors.push('활동 시작 시각은 0~23 사이 정수여야 합니다');
  if (!Number.isInteger(end) || end < 1 || end > 24)
    errors.push('활동 종료 시각은 1~24 사이 정수여야 합니다');
  if (Number.isInteger(start) && Number.isInteger(end) && start >= end)
    errors.push('활동 시작 시각은 종료 시각보다 앞서야 합니다');

  // 상한은 없고 하한도 "0보다 크다"뿐이다. 실수를 그대로 받는다(0.3 → 0.3초, ADR-0013)
  let floorSec: number | null = null;
  const raw = typeof input.floorSec === 'string' ? input.floorSec.trim() : input.floorSec;
  if (raw !== null && raw !== '') {
    const f = Number(raw);
    if (!Number.isFinite(f)) errors.push('삭제 간격은 숫자여야 합니다');
    else if (f <= 0) errors.push('삭제 간격은 0보다 커야 합니다');
    else floorSec = f;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { preset, activeStartHour: start, activeEndHour: end, floorSec } };
}

/** 저장된 값이 손상됐거나 구버전이면 기본값으로 보정 */
export function coerceRunSettings(raw: unknown): RunSettings {
  const r = (raw ?? {}) as Partial<RunSettings>;
  const v = validateRunSettings({
    preset: r.preset ?? DEFAULT_RUN_SETTINGS.preset,
    activeStartHour: r.activeStartHour ?? DEFAULT_RUN_SETTINGS.activeStartHour,
    activeEndHour: r.activeEndHour ?? DEFAULT_RUN_SETTINGS.activeEndHour,
    floorSec: r.floorSec ?? null,
  });
  return v.ok ? v.value : DEFAULT_RUN_SETTINGS;
}
