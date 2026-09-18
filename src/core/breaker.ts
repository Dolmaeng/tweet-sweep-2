// 회로차단 상태기계 (SRS §6, ADR-0007). 순수 reducer. 시각·난수는 주입.
import type { Rng, Signal } from './models';

export type BreakerStatus = 'closed' | 'cooling' | 'halted_hours' | 'halted';

export interface BreakerState {
  status: BreakerStatus;
  /** cooling·halted_hours일 때 재개 가능 시각(ms epoch) */
  until: number;
  /** 오늘 발생한 rate-limit/차단 횟수 */
  blocksToday: number;
  /** 연속 오류 수. 진단용 카운터일 뿐 이 값으로 중지하지 않는다 */
  consecutiveErrors: number;
  /** halted 사유(사람 확인용) */
  reason?: string;
}

export const initialBreaker: BreakerState = {
  status: 'closed',
  until: 0,
  blocksToday: 0,
  consecutiveErrors: 0,
};

export type BreakerEvent =
  | { type: 'ok' }
  | { type: 'gone' }
  | { type: 'rate_limit'; resetMs: number }
  | { type: 'blocked'; signal: Signal }
  | { type: 'error' };

const MIN = 60_000;

/** 다음 상태를 계산한다. now=현재 ms, rng=[0,1) */
export function reduceBreaker(
  state: BreakerState,
  event: BreakerEvent,
  now: number,
  rng: Rng = Math.random,
): BreakerState {
  switch (event.type) {
    case 'ok':
    case 'gone':
      return { ...state, status: 'closed', until: 0, consecutiveErrors: 0 };

    // 연속 오류로는 멈추지 않는다(사용자 요청). 횟수는 진단용으로만 센다.
    // 429·차단·잠금은 아래 case들이 그대로 잡는다.
    case 'error':
      return { ...state, consecutiveErrors: state.consecutiveErrors + 1 };

    case 'blocked':
      return {
        ...state,
        status: 'halted',
        consecutiveErrors: 0,
        reason: event.signal === 'account_locked' ? '계정 잠금 감지' : '로그인/인증 필요',
      };

    case 'rate_limit': {
      const blocksToday = state.blocksToday + 1;
      if (blocksToday >= 3) {
        return { ...state, status: 'halted', blocksToday, reason: 'rate-limit 반복(오늘 중지)' };
      }
      if (blocksToday === 2) {
        // 2~4시간 정지
        const until = now + (2 + rng() * 2) * 60 * MIN;
        return { ...state, status: 'halted_hours', until, blocksToday, consecutiveErrors: 0 };
      }
      // 1회: reset + 5~15분 후 재개
      const until = now + event.resetMs + (5 + rng() * 10) * MIN;
      return { ...state, status: 'cooling', until, blocksToday, consecutiveErrors: 0 };
    }
  }
}

/** 하루 경계에서 카운터 초기화(스케줄러가 날짜 바뀔 때 호출) */
export function resetDaily(state: BreakerState): BreakerState {
  return { ...state, blocksToday: 0 };
}
