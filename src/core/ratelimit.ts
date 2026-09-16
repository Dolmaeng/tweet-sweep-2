// x-rate-limit-* 응답 헤더 파싱 (ADR-0007). 순수 함수, 브라우저 API 무의존.

export interface RateLimit {
  /** x-rate-limit-limit: 창당 허용 요청 수 (L) */
  limit: number;
  /** x-rate-limit-remaining: 창 내 잔여 (R) */
  remaining: number;
  /** reset까지 남은 초 (W 파생). 음수는 0으로 */
  resetSec: number;
}

export interface HeaderPair {
  name: string;
  value?: string | undefined;
}

/** DeleteTweet 응답 헤더에서 예산을 읽는다. 세 값이 다 없으면 null */
export function parseRateLimit(
  headers: HeaderPair[],
  nowMs: number = Date.now(),
): RateLimit | null {
  let limit: number | undefined;
  let remaining: number | undefined;
  let reset: number | undefined;
  for (const h of headers) {
    switch (h.name.toLowerCase()) {
      case 'x-rate-limit-limit':
        limit = Number(h.value);
        break;
      case 'x-rate-limit-remaining':
        remaining = Number(h.value);
        break;
      case 'x-rate-limit-reset':
        reset = Number(h.value);
        break;
    }
  }
  if (limit === undefined || remaining === undefined || reset === undefined) return null;
  if (![limit, remaining, reset].every((n) => Number.isFinite(n))) return null;
  const nowSec = Math.floor(nowMs / 1000);
  return { limit, remaining, resetSec: Math.max(0, reset - nowSec) };
}
