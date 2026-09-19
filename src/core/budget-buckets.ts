// GraphQL 연산별 rate-limit 버킷 (ADR-0014). 순수 함수, 브라우저 API 무의존.
//
// X는 한도를 엔드포인트마다 따로 준다. 글 한 건을 지우려면 그 페이지를 한 번 읽어야 하므로
// 삭제(DeleteTweet)와 읽기(TweetDetail·UserTweetsAndReplies…)가 1:1로 같이 늘어난다.
// 삭제 버킷만 보면 읽기가 먼저 바닥나는 걸 못 보고, 그때 화면이 "Something went wrong"이 된다.
// 그래서 관측한 모든 버킷을 들고 있다가 **가장 빡빡한 것**을 실행 판단에 쓴다.

export interface Bucket {
  op: string;
  limit: number;
  remaining: number;
  resetSec: number;
  /** 관측 시각(ms epoch) */
  atMs: number;
}

/** 관측이 이보다 오래되면 버린다. 창이 이미 리셋됐을 값으로 판단하면 안 된다 */
export const BUCKET_TTL_MS = 15 * 60_000;

/** 살아 있는 버킷만. resetSec이 지났으면 그 창은 이미 리셋됐다 */
export function freshBuckets(buckets: Bucket[], nowMs: number): Bucket[] {
  return buckets.filter(
    (b) => nowMs - b.atMs < BUCKET_TTL_MS && nowMs < b.atMs + b.resetSec * 1000,
  );
}

/**
 * 실행을 막는 버킷. 남은 비율이 가장 낮은 것이다.
 * 관측값이 없으면 null — 호출자는 그걸 "한도 없음"이 아니라 "모름"으로 다뤄야 한다.
 */
export function tightestBucket(buckets: Bucket[], nowMs: number): Bucket | null {
  const live = freshBuckets(buckets, nowMs);
  if (live.length === 0) return null;
  return live.reduce((worst, b) =>
    b.remaining / Math.max(b.limit, 1) < worst.remaining / Math.max(worst.limit, 1) ? b : worst,
  );
}
