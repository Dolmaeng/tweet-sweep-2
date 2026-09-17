# X 웹 클라이언트 삭제 메커니즘 노트 (2026-09-17 조사)

## 요청 구조 (세션 기반 도구들이 쓰는 방식)
- 엔드포인트: `https://x.com/i/api/graphql/<queryId>/<Operation>` POST. 작업별 Operation: `DeleteTweet`(글 삭제) · `DeleteRetweet`(리포스트 취소, **원글 id** 사용) · `UnfavoriteTweet`(좋아요 취소) · `DeleteBookmark`
- 인증: 쿠키 세션 + 헤더 `authorization: Bearer <웹 클라이언트 공개 토큰>`, `x-csrf-token` = 쿠키 `ct0`, `x-twitter-auth-type: OAuth2Session`. 사용자 id는 쿠키 `twid`(`u%3D<id>`)
- `queryId`는 X 배포마다 회전. Cyd는 `webRequest`로 세션의 실제 트래픽에서 식별자를 관찰해 우선 사용, 하드코딩 값은 콜드스타트 대비용
- referrer를 작업 출처에 맞춤: DeleteTweet → `https://x.com/<username>`, DeleteRetweet → `/<username>/reposts`, Unfavorite → `/i/history/likes`, DeleteBookmark → `/i/history`
- X 웹 클라이언트는 요청마다 `x-client-transaction-id`를 붙임. Cyd 재전송은 이를 생략하고도 동작(2026-09 기준). 향후 필수화 가능성은 위험 요인

## 속도 제한 신호
- HTTP 429 + 본문 `Rate limit exceeded` + 헤더 `x-rate-limit-limit / -remaining / -reset`
- 성공 상태(200)인데 본문에 rate-limit 오류 페이로드가 오는 경우도 있음 → 429와 동일 취급(Cyd)
- 공식 API 삭제 한도는 50/15min. 웹 클라이언트 한도는 비공개지만 유사하다고 가정하고 그 일부만 사용
- Cyd는 한도에 걸리면 15분 미만 대기 후 재개. 사전 백오프(remaining 헤더 기반)는 미채택

## UI 클릭 방식 (대안 실행기)
- 글 페이지 `https://x.com/i/status/<id>` → 글 `article[data-testid="tweet"]` → 더보기 `[data-testid="caret"]` → 메뉴 `[role="menuitem"]` 중 "삭제/Delete" → 확인 `[data-testid="confirmationSheetConfirm"]`
- 장점: 네트워크 요청을 X 클라이언트가 스스로 생성(트랜잭션 헤더·텔레메트리 포함) → 사람과 구별 불가. 식별자 회전 무관
- 단점: 페이지 로드 1~3s, DOM·문구 변경에 취약(언어별 라벨), 합성 이벤트 `isTrusted=false`(현재 X는 미검사로 보임. 필요 시 `chrome.debugger` 입력 이벤트로 대체 가능)
- 국내 확장 "트청 도우미"(ketrewq)가 이 방식. PoC 수준, "여러 번 돌려야 다 지워짐"

## 동종 도구 요약
| 도구 | 방식 | 간격 | 열람 |
|---|---|---|---|
| Cyd(Electron) | GraphQL 재전송, 식별자 관찰 | 최대 속도, 429 시 대기 | 프로필 스크롤 + JS |
| Tweet-Removal-Tool(확장) | GraphQL, bearer·ct0 추출 | 600ms 고정(공격적) | UserTweets 페이지네이션 |
| 트청 도우미(확장) | UI 클릭 | 미문서화 | 답글 탭 스크롤 |
| 큐비(확장, 비공개) | 미확인 | 미확인 | 아카이브 |

## 출처
- https://github.com/lockdown-systems/cyd/issues/707 · /issues/711 · /pull/716
- https://github.com/iteratequickly/Tweet-Removal-Tool
- https://github.com/ketrewq/tweet-deleter
- https://twaffle.net/%ED%8A%B8%EC%99%80%ED%94%8C-%EC%B2%AD%EC%86%8C%EA%B8%B0%ED%99%95%EC%9E%A5%ED%98%95-%EA%B0%80%EC%9D%B4%EB%93%9C/ (딜레이 권고·차단 경고)

## 검증된 UI 셀렉터 (2026-09-17, 실제 삭제 성공)
- 대상 글: `article[data-testid="tweet"]` 중 `a[href]`가 `/status/<postId>`를 가리키는 것. **답글 페이지는 원글(남의 글)이 위에 먼저 렌더**되므로 첫 article은 위험(2026-09-17 라이브: 원글 메뉴 `언팔로우|차단|신고`가 열려 연속 오류 정지). article이 하나뿐일 때만 링크 없이 허용
- 더보기(…): `[data-testid="caret"]`. **상태 페이지에서는 이 버튼이 article 요소 바깥(헤더)에 있음** → 문서 전체에서 잡되 **다른 article 안에 있는 caret은 제외**(위 원글의 caret 오집음 방지)
- 함정: 재게시 버튼은 `aria-haspopup="menu"`를 가짐 → caret 대체 셀렉터로 aria-haspopup 쓰면 재게시 메뉴(`재게시 retweetConfirm | 인용하세요`)를 잘못 엶. 절대 금지
- 삭제 메뉴 항목: `[role="menuitem"]` 중 텍스트 "삭제"/"Delete"
- 확인: `[data-testid="confirmationSheetConfirm"]`
