// 실행 루프의 결정 함수 (plan §5). 순수 함수: 스냅샷 → 다음 명령.
// 대시보드 run 루프가 이 결정을 실행하고 결과로 상태를 갱신한 뒤 다시 부른다(하네스 방식).
import type { Rng } from './models';
import type { BreakerState } from './breaker';
import {
  type PresetSpec,
  type RateBudget,
  nextActiveStart,
  nextDelayMs,
  shouldWaitForReset,
  warmupUtil,
} from './pacing';

export interface RunSnapshot {
  /** 남은 대상 수 */
  pending: number;
  /** 지금까지 성공한 삭제 수(워밍업 계산) */
  deletedSoFar: number;
  breaker: BreakerState;
  /** 관측된(또는 기본) 예산 */
  budget: RateBudget;
  /** 관측된 잔여(x-rate-limit-remaining) 또는 null */
  remaining: number | null;
  /** 관측한 창 리셋 시각(ms epoch). 모르면 null → 창 길이를 통째로 기다린다 */
  resetAtMs: number | null;
  preset: PresetSpec;
  activeStartHour: number;
  activeEndHour: number;
  /** 사용자 일시정지 */
  paused: boolean;
}

export type Command =
  | { type: 'delete' }
  | { type: 'wait'; untilMs: number; reason: string }
  | { type: 'stop'; reason: string }
  | { type: 'done' };

export function decide(snap: RunSnapshot, now: number): Command {
  const b = snap.breaker;
  if (b.status === 'halted') return { type: 'stop', reason: b.reason ?? '중지' };
  if ((b.status === 'cooling' || b.status === 'halted_hours') && now < b.until) {
    return {
      type: 'wait',
      untilMs: b.until,
      reason: b.status === 'cooling' ? 'rate-limit 회복 대기' : '차단 후 정지',
    };
  }
  if (snap.paused) return { type: 'wait', untilMs: now + 60_000, reason: '일시정지' };
  if (snap.pending <= 0) return { type: 'done' };

  const start = nextActiveStart(new Date(now), snap.activeStartHour, snap.activeEndHour);
  if (start !== null) return { type: 'wait', untilMs: start, reason: '활동 시간대 밖' };

  const u = warmupUtil(snap.preset, snap.deletedSoFar);
  if (snap.remaining !== null && shouldWaitForReset(snap.remaining, snap.budget.limit, u)) {
    // 헤더가 알려준 리셋 시각까지만 기다린다. 창 길이(900초)를 통째로 더하면
    // 이미 흘러간 시간을 두 번 세어, "리셋 562초"를 보고 15분을 잔다 (ADR-0015).
    const until = snap.resetAtMs ?? now + snap.budget.windowSec * 1000;
    return {
      type: 'wait',
      // 리셋 시각이 이미 지났으면 다음 회차에 다시 판단한다. 그때는 버킷이 만료돼 잔여가 null이다
      untilMs: Math.max(until, now + 1_000),
      reason: '예산 소진 — 창 리셋 대기',
    };
  }
  return { type: 'delete' };
}

/** 한 건 삭제 후 다음까지의 대기(ms) */
export function pacingDelayMs(snap: RunSnapshot, rng: Rng = Math.random): number {
  return nextDelayMs(snap.preset, snap.budget, snap.deletedSoFar, rng);
}
