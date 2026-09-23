# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

로그인한 x.com 세션 안에서 내 게시물을 사람보다 느리게 자동 삭제하는 개인용 Chrome 확장(MV3, WXT + TypeScript + React). 서버 없음, 모든 상태는 IndexedDB.

**문서와 코드가 어긋나면 문서가 먼저다.** `docs/spec/00-constitution.md`(헌장)가 요구사항·설계·코드보다 우선하고, 모든 아키텍처 결정은 `docs/adr/`에 있다. 페이싱·안전·타임라인을 건드리기 전에 해당 ADR을 읽어라.

## 명령

```bash
npm run check          # 끝내기 전 반드시. compile + lint + format:check + test
npm test               # vitest run
npx vitest run tests/unit/core/scheduler.test.ts    # 파일 하나
npx vitest run -t "리셋 시각"                        # 이름으로 골라서
npm run build          # → .output/chrome-mv3 (chrome://extensions에 압축해제 로드)
npm run dev            # 확장을 자동 로드한 Chrome 창. 임시 프로필이라 X 로그인은 따로
```

`npm run format`(prettier --write)으로 포맷을 고친다. `format:check`가 `npm run check`의 흔한 실패 원인이다.

## 아키텍처

### 계층과 의존 방향

```
core → (아무것도 의존하지 않음)
platform, executors → core
entrypoints(dashboard, background, xcom.content) → 전부
```

`src/core/**`는 **브라우저 API 무의존이고 eslint가 강제한다**(`no-restricted-globals`로 window·document·chrome·indexedDB 차단, `no-restricted-imports`로 wxt·platform·executors·react·idb 차단). 순수 함수는 여기 두고 테스트한다. DOM을 만지면 `src/executors/`, 브라우저 API를 부르면 `src/platform/`이다.

### 대시보드가 오케스트레이터다 (ADR-0004)

서비스 워커가 아니라 **대시보드 페이지가 실행 루프를 돈다.** MV3 서비스 워커는 수시로 죽어서 몇 시간짜리 작업을 맡길 수 없다.

- `src/entrypoints/background.ts` — 최소 역할만: 대시보드 열기 + `webRequest`로 rate-limit 헤더 관측
- `src/entrypoints/dashboard/screens/{LiveRun,SweepRun}.tsx` — 루프를 시작하고 이벤트를 화면에 그린다
- `src/platform/{runner,sweep}.ts` — 실제 루프. 탭을 몰고 결과를 IndexedDB에 쓴다
- `src/entrypoints/xcom.content.ts` — x.com 탭에서 명령을 받아 DOM을 만진다
- 메시지 타입은 전부 `src/messaging/protocol.ts`의 discriminated union

### 실행 루프의 심장: 순수 결정 함수

`src/core/scheduler.ts`의 `decide(snapshot, now) → Command`가 "지금 지울까·기다릴까·멈출까"를 정한다. 순수 함수라 테스트가 쉽다. 루프(runner/sweep)는 그 명령을 수행하고 결과로 스냅샷을 갱신해 다시 부른다.

같은 코어를 두 모드가 공유한다:

| 모드     | 진입                               | 대상                                                          | 파일                 |
| -------- | ---------------------------------- | ------------------------------------------------------------- | -------------------- |
| 아카이브 | 아카이브 zip 가져오기 → plan → run | 미리 만든 목록을 글 페이지에서 하나씩                         | `platform/runner.ts` |
| 스윕     | 아카이브 없이 바로                 | 프로필 타임라인 맨 위 카드를 그 자리에서 (ADR-0009, ADR-0016) | `platform/sweep.ts`  |

### 안전 엔진 — 함부로 완화하지 말 것

헌장 P1이 코드로 굳어 있다. 이 부분을 "빠르게" 바꾸자는 요청이 오면 어느 ADR을 뒤집는지 먼저 말해라.

- `core/pacing.ts` — 프리셋·간격 산식·워밍업·로그노멀 지터. `HARD_MAX_UTIL`(0.95)·`HARD_MAX_PER_DAY`(8,000)는 설정으로 초과 불가
- `core/breaker.ts` — 429·로그인 리다이렉트·계정 잠금에 반응하는 상태기계. **연속 오류로는 멈추지 않는다**(2026-09-19). 그 글만 건너뛰고 간다
- `core/budget-buckets.ts` — GraphQL 연산별 rate-limit 버킷. 삭제 경로 연산만 실행을 막는다(`PACED_OPERATIONS`, ADR-0015). 무관한 연산을 여기 넣으면 삭제가 남의 예산으로 멈춰 선다
- `core/backoff.ts` — 페이지 단위 장애는 중지가 아니라 1→2→5→15분 후퇴 (ADR-0014)

### 실패의 종류를 가른다 (ADR-0014)

`Signal`을 뭉뚱그리지 마라. 원인이 다르면 처리도 다르다.

- `page_unavailable`·`unknown_error` = **페이지 단위**. 그 글의 `attempts`를 깎지 않고, 후퇴했다 같은 글을 다시 집는다
- `dom_changed` = 셀렉터가 바뀌었다. 그 글에서 실제로 벌어진 일
- `isPageLevelSignal()`이 그 경계다

## X DOM을 다룰 때

**추측하지 말고 확인해라.** `docs/learn/x-web-client.md`의 셀렉터는 날짜가 붙은 관측 기록이지 현재 보장이 아니다. X는 실제로 구조를 바꾼다 — 2026-09-23에 프로필 탭이 갈라지면서(`/with_replies`가 답글 전용이 됨) 스윕이 답글만 지우고 있었다. 확인 수단은 claude-in-chrome(읽기 전용 확인만, 삭제·재게시 취소 클릭은 하지 않는다).

굳은 함정들:

- 대상 카드는 **`<time>`을 품은 `a[href]`**(permalink)로 고른다. `a[href*="/status/"]` 첫 번째는 인용글·부모글을 집는다
- caret 대체 셀렉터로 `aria-haspopup`을 쓰면 **재게시 메뉴가 열린다.** 절대 금지
- 리포스트 카드의 caret은 **원작성자 메뉴**(언팔로우·차단·신고)다. 재게시 취소는 `unretweet` → `unretweetConfirm`으로만 (ADR-0016)
- 리포스트 카드의 permalink handle은 원작성자다. "내 글인가"를 handle로 물을 수 없어 `unretweet` 버튼의 존재를 증거로 쓴다
- 메뉴는 합성 Escape로 안 닫힌다. `#layers`의 전면 배경을 눌러야 한다
- 글 ID 비교는 **문자열 비교가 틀린다**(18자리/19자리). `core/order.ts`의 `compareIds`를 쓴다

## 작업을 마칠 때

1. `npm run check` + `npm run build`
2. 아키텍처 결정이면 `docs/adr/NNNN-제목.md` 하나 추가 — 증상·원인·결정·남는 것·**대안 표**(기각 이유 포함)
3. `docs/log/YYYY-MM-DD.md`에 그날 기록 — 사용자 보고 원문, 추적 과정, 함정
4. 바뀐 요구사항은 `docs/spec/01-requirements.md`, 작업은 `docs/spec/03-tasks.md`에 반영. 낡은 ADR에는 폐기 표시
5. 커밋 메시지는 **한국어**. 제목은 무엇을 바꿨는지, 본문은 원인과 판단 근거, 끝에 ADR 번호

주석과 문서는 헌장 P9를 따른다: 개조식, 간결, **틀린 내용 0**. 주석은 "무엇"이 아니라 왜 그렇게 했는지와 어떤 함정을 피했는지를 적는다 — 기존 코드의 주석 밀도와 어조를 그대로 맞춰라.
