// x.com URL 구성·판별. 순수 함수 (core, 브라우저 API 무의존).

export function statusUrl(username: string, postId: string): string {
  return `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(postId)}`;
}

export function profileUrl(username: string): string {
  return `https://x.com/${encodeURIComponent(username)}`;
}

/** 원글과 답글이 함께 나오는 타임라인 (FR-18 스윕 대상 페이지) */
export function withRepliesUrl(username: string): string {
  return `https://x.com/${encodeURIComponent(username)}/with_replies`;
}

/** GraphQL DeleteTweet 뮤테이션 URL인가. queryId는 배포마다 회전하므로 연산명으로 판별 */
export function isGraphqlDelete(url: string): boolean {
  return graphqlOperation(url) === 'DeleteTweet';
}

/**
 * GraphQL 연산명(`/i/api/graphql/<queryId>/<Operation>`). 아니면 null.
 *
 * 삭제(DeleteTweet)와 읽기(TweetDetail·UserTweetsAndReplies…)는 **한도 버킷이 서로 다르다**.
 * 삭제만 보면 읽기 한도가 먼저 바닥나는 걸 못 본다(2026-09-19: 200건쯤에서 page:unknown).
 */
export function graphqlOperation(url: string): string | null {
  return /\/i\/api\/graphql\/[^/]+\/([A-Za-z0-9_]+)(?:[?#]|$)/.exec(url)?.[1] ?? null;
}
