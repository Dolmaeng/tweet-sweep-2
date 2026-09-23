// x.com URL 구성·판별. 순수 함수 (core, 브라우저 API 무의존).

export function statusUrl(username: string, postId: string): string {
  return `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(postId)}`;
}

export function profileUrl(username: string): string {
  return `https://x.com/${encodeURIComponent(username)}`;
}

/**
 * 스윕이 훑을 프로필 탭 (ADR-0016).
 * - all: 드롭다운의 "전체". 원글·답글·리포스트·미디어가 한 타임라인에 다 나온다
 * - with_replies: "답글" 탭. **답글만** 나온다
 */
export type SweepTab = 'all' | 'with_replies';

/**
 * 전체 탭. 프로필 탭 줄 맨 왼쪽 드롭다운에서 "전체"를 고르면 가는 주소다.
 * 2026-09-23 라이브 확인: 메뉴 항목에 href가 없지만 고르면 주소가 /<handle>/all이 되고,
 * 이 주소로 직접 들어가도 "전체"가 선택된 상태로 열린다.
 */
export function allTabUrl(username: string): string {
  return `https://x.com/${encodeURIComponent(username)}/all`;
}

/**
 * 답글 탭. 예전에는 원글과 답글이 함께 나왔으나 지금은 **답글만** 나온다(2026-09-23 확인).
 * 그래서 스윕 기본 페이지가 아니다 — 답글만 노리는 필터일 때만 쓴다.
 */
export function withRepliesUrl(username: string): string {
  return `https://x.com/${encodeURIComponent(username)}/with_replies`;
}

/** 스윕이 열 타임라인 주소 */
export function sweepTimelineUrl(username: string, tab: SweepTab): string {
  return tab === 'with_replies' ? withRepliesUrl(username) : allTabUrl(username);
}

/** 그 탭이 선택됐을 때 주소창의 경로. 탭 앵커의 href와 같다 */
export function sweepTabPath(username: string, tab: SweepTab): string {
  return `/${username}/${tab === 'with_replies' ? 'with_replies' : 'all'}`;
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
