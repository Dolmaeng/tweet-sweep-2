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

/**
 * 실행을 가로막을 자격이 있는 연산. 삭제 경로에 실제로 쓰이는 것만이다 (ADR-0015).
 *
 * ADR-0014에서 관측을 "모든 GraphQL"로 넓힌 것이 지나쳤다. 크리에이터 스튜디오 탭바를
 * 그리는 `CreatorStudioTabBarItemQuery`처럼 삭제와 무관한 연산의 좁은 버킷(한도 50)이
 * tightestBucket에 뽑혀 삭제를 창 하나씩 세웠다. 우리가 쓴 예산이 아니므로 판단에서 뺀다.
 *
 * 연산명이 바뀌면(TweetDetail→TweetDetailV2 같은) 그 버킷을 못 본다. 그래도 조용히
 * 폭주하지는 않는다 — 화면이 "예산 미관측"으로 바뀌고, 페이지가 안 열리기 시작하면
 * ADR-0014의 페이지 단위 백오프가 물러나게 한다.
 */
export const PACED_OPERATIONS: ReadonlySet<string> = new Set([
  // 삭제 뮤테이션 (docs/learn/x-web-client.md)
  'DeleteTweet',
  'DeleteRetweet',
  'UnfavoriteTweet',
  'DeleteBookmark',
  // 지우기 전에 반드시 한 번 읽는 화면들. 읽기 요청은 삭제와 1:1로 늘어난다
  'TweetDetail',
  'TweetResultByRestId',
  'UserByScreenName',
  'UserTweets',
  'UserTweetsAndReplies',
  'UserMedia',
  'Likes',
  'Bookmarks',
]);

/** 이 연산의 한도가 우리 실행을 막아야 하는가. 아니면 관측해도 무시한다 */
export function isPacedOperation(op: string): boolean {
  return PACED_OPERATIONS.has(op);
}

/**
 * 이 관측이 말하는 창 리셋 시각(ms epoch).
 * `resetSec`은 관측 시점 기준 잔여다. 나중에 그대로 더하면 흘러간 시간만큼 더 기다린다.
 */
export function resetAtMs(b: Bucket): number {
  return b.atMs + b.resetSec * 1000;
}

/** 살아 있는 버킷만. resetSec이 지났으면 그 창은 이미 리셋됐다 */
export function freshBuckets(buckets: Bucket[], nowMs: number): Bucket[] {
  return buckets.filter((b) => nowMs - b.atMs < BUCKET_TTL_MS && nowMs < resetAtMs(b));
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
