# Chrome 확장 MV3 제약·선택지 노트 (2026-09-17 조사)

## 수명 주기
- 서비스 워커: 유휴 약 30s 후 종료, V8 힙 해제. 이벤트 수신·확장 API 호출 시 타이머 리셋. 핸들러 1회 실행 5분 상한
- `chrome.alarms`: 최소 주기 30s(Chrome 120+). 워커가 죽어 있어도 깨움 → 30s 이상 간격 스케줄러로 적합
- 오프스크린 문서: 숨은 HTML, 1개만, `chrome.runtime` 메시징만 가능(tabs/scripting 불가)
- 확장 페이지(탭으로 연 `chrome-extension://…/x.html`): 일반 웹페이지 수명. 열려 있는 동안 `setTimeout` 자유 → 본 프로젝트 오케스트레이터(ADR-0004)

## 실행 컨텍스트
- 콘텐츠 스크립트: x.com 페이지 DOM 접근, 격리된 JS 세계(페이지 변수 직접 접근 불가). `chrome.scripting.executeScript({world:"MAIN"})`로 페이지 세계 주입 가능
- `webRequest`(MV3): 관측만 가능(차단·수정은 `declarativeNetRequest`). 요청 헤더·응답 상태 관찰로 식별자·429 감지 가능
- 쿠키: `ct0`·`twid`는 HttpOnly 아님 → 콘텐츠 스크립트 `document.cookie` 또는 `chrome.cookies`

## 저장
- IndexedDB(확장 오리진) — 콘텐츠 스크립트는 접근 불가, 메시징으로 위임. 3만 건 + 원본 JSON ≈ 수십 MB → `unlimitedStorage` 권한
- `chrome.storage.local`은 설정·소량 상태용

## 보안·정책
- 원격 코드 실행 금지. CSP 기본 `script-src 'self'`. 외부 전송 없음 유지(P2)
- 권한 최소화: `storage` `tabs` `scripting` `alarms`(선택) `webRequest`(관측) + host `https://x.com/*`

## 프레임워크 (2026)
| 도구 | 특징 | 판단 |
|---|---|---|
| WXT | Vite 기반, Nuxt식 `entrypoints/` 규약, TS 기본, Chrome/Edge/Firefox 빌드, HMR, 활발히 유지 | 2026 신규 프로젝트 권장 1순위 |
| CRXJS | Vite 플러그인, 경량 | Vite 프로젝트에 붙일 때 |
| Plasmo | Parcel 기반, React 중심, 2025 유지 불확실 | 기각 |
| 바닐라 JS 무빌드 | Node 불필요, clone 즉시 로드 | 학습 폭 좁음, 타입 없음 |

## 출처
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3
- https://wxt.dev/guide/installation.html
- https://dev.to/extensionbooster/plasmo-vs-crxjs-vs-wxt-which-chrome-extension-framework-should-you-use-in-2026-37o4
