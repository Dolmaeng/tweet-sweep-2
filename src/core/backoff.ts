// 페이지 단위 장애 백오프 (ADR-0014). 순수 함수, 브라우저 API 무의존.
//
// 429 뒤의 "Something went wrong" 화면은 글 하나의 문제가 아니라 창 예산이 바닥난 신호다.
// 이때 남은 글을 계속 빠르게 훑으면 전부 실패로 소진된다(2026-09-19 사용자 보고: 200건쯤).
// 그렇다고 멈추면 밤새 돌 수 없다. 그래서 **멈추지 않고 물러나 기다린다**.

/** 연속 실패 1·2·3·4회차의 대기(ms). 그 이상은 마지막 값(창 하나)을 유지한다 */
export const PAGE_BACKOFF_MS: number[] = [60_000, 120_000, 300_000, 900_000];

/**
 * 연속 페이지 장애 횟수(1부터)에 대한 대기 시간(ms).
 * 상한이 있고 절대 0을 주지 않는다 — 0을 주면 장애 중에 큐를 태운다.
 */
export function pageBackoffMs(consecutive: number): number {
  const i = Math.min(Math.max(consecutive, 1), PAGE_BACKOFF_MS.length) - 1;
  return PAGE_BACKOFF_MS[i]!;
}
