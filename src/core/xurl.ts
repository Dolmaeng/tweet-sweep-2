// x.com URL 구성·판별. 순수 함수 (core, 브라우저 API 무의존).

export function statusUrl(username: string, postId: string): string {
  return `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(postId)}`;
}

export function profileUrl(username: string): string {
  return `https://x.com/${encodeURIComponent(username)}`;
}

/** GraphQL DeleteTweet 뮤테이션 URL인가. queryId는 배포마다 회전하므로 연산명으로 판별 */
export function isGraphqlDelete(url: string): boolean {
  return /\/i\/api\/graphql\/[^/]+\/DeleteTweet(\?|$)/.test(url);
}
