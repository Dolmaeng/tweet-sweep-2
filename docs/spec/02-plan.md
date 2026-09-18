# 구현 계획 (Plan)

- 상태: v0.1 · 2026-09-17 · SRS v0.2 기준
- 순서: M1 스파이크 A(가져오기·analyze) → M2 스파이크 B(1건 UI 삭제) → M3 v1(run 전체) → M4 예비 실행기·확장 액션 → M5 v2

## 1. 저장소 구조 (WXT 규약)
```
tweet-sweep-2/
  package.json  wxt.config.ts  tsconfig.json  vitest.config.ts  .nvmrc
  entrypoints/
    background.ts          서비스 워커: 메시지 중계, 작업 탭 생성·이동, webRequest 관측(429·리다이렉트)
    xcom.content.ts        x.com 콘텐츠 스크립트: 실행기 명령 수행, 페이지 유형·DOM 신호 감지
    dashboard/             확장 페이지(React): 위험 고지·가져오기·analyze·plan·run·설정·로그
      index.html  main.tsx  App.tsx  pages/  components/
  src/
    core/                  순수 TS, 브라우저 API 무의존
      models.ts            Post, PostKind, Account, Job, JobItem, AuditEvent, Signal
      archive/parse.ts     tweets.js·account.js 파싱(zip은 fflate)
      filters/             base.ts + 필터 1개 = 파일 1개
      pacing.ts            프리셋·간격·예산·활동시간·워밍업·하드 상한
      breaker.ts           회로차단 상태기계
      scheduler.ts         run 루프 상태기계(clock·executor 주입)
      report.ts            analyze/plan 집계
    platform/              chrome.* 래퍼(tabs·scripting·storage·cookies·webRequest), IndexedDB(idb)
    executors/
      types.ts             Executor 인터페이스, 결과 타입
      ui-click.ts          글 페이지 → caret → 삭제 → 확인. 셀렉터·라벨 설정화
      graphql-replay.ts    예비. 식별자 관찰 저장소 + page-world fetch
    messaging/protocol.ts  대시보드↔SW↔콘텐츠 메시지 타입(discriminated union)
  tests/  unit(core)  executors(happy-dom fixture)  fixtures(합성 아카이브·DOM 스냅샷)
  public/icons  docs/
```
- 의존 방향: `dashboard → core, platform, executors` · `content → executors(ui-click 실행부), messaging` · `core`는 어디에도 의존 안 함

## 2. 데이터 모델 (IndexedDB `tweet-sweep-2`)
| 스토어 | 키 | 값 | 메모 |
|---|---|---|---|
| `accounts` | userId | username, archiveGeneratedAt, importedAt, consentAt | twid 검증 결과 |
| `posts` | [userId, postId] | createdAt, kind, text, inReplyTo, hasMedia, likeCount, rtCount, raw | 스냅샷 겸용. 인덱스 kind·createdAt |
| `jobs` | jobId | userId, filterSpec, preset, createdAt, status | plan 1회 = job 1 |
| `jobItems` | [jobId, postId] | status(pending/running/done/gone/blocked/failed/skipped), attempts, lastSignal, doneAt | 인덱스 status |
| `audit` | auto | ts, jobId, postId, executor, result, signal, durationMs | JSONL 내보내기 |
| `budget` | [userId, day] | count, blockedCount | 일일 상한·하향 판단 |
| `settings` | key | value | 프리셋·시간대·실행기·셀렉터·라벨 |
- 쓰기 순서: 항목 `attempts+1`·running 커밋 → 실행 → 결과 커밋. 재개 시 running은 재시도(이미 없으면 gone)

## 3. 메시지 프로토콜
- 대시보드 → SW: `ENSURE_WORKER_TAB` · `NAVIGATE {tabId,url}` · `EXECUTE {tabId, postId, executor, options}` · `PROBE_SESSION`(로그인·twid)
- SW → 콘텐츠: `EXECUTE` 전달 · 콘텐츠 → SW → 대시보드: `RESULT {postId, result: ok|gone|blocked|error, signal?, detail?}`
- SW 관측 → 대시보드: `NET_SIGNAL {kind: rate_limit|auth_redirect, at}` (webRequest onCompleted 429 / 로그인 302)
- 모든 메시지는 `protocol.ts` 타입으로만 생성. 런타임 검증은 zod(선택)

## 4. `ui-click` 실행기 흐름
1. 대시보드가 작업 탭을 `https://x.com/i/status/<id>`로 이동 → 로딩 완료 대기
2. 콘텐츠: 페이지 유형 판정 — 로그인·잠금·인증 페이지 → `blocked` · "존재하지 않는 글" → `gone`
3. `article[data-testid="tweet"]` 중 링크 `/status/<id>` 포함 요소 확보(타임아웃 10s)
4. `[data-testid="caret"]` 클릭 → `[role="menu"]` 대기 → `[role="menuitem"]` 텍스트가 라벨 목록(`삭제`, `Delete`)과 일치 → 클릭
5. `[data-testid="confirmationSheetConfirm"]` 클릭 → 3s 내 글 제거 또는 확인 토스트 → `ok`. 오류 토스트(문제 발생/Rate limit) → `blocked`
6. 단계별 타임아웃, 스크린샷 없음(개인정보). 실패 시 단계 이름을 `detail`에 기록

## 5. 안전 엔진 (ADR-0007 적응형)
- `pacing.ts`: 입력 = 프리셋(u, 플로어) + 관측 예산(L, W, R, reset) + 워밍업 진행도. `nextDelayMs()` = max(플로어, W÷(u·L)) × 로그노멀(σ 0.35) + 4% 확률 20~40초 휴식. R < (1−u)·L 이면 reset까지 대기. 세션 60~120분마다 10~30분 휴식. 활동 시간대 경계 ±45분 일별 무작위
- 예산 관측: `background.ts`의 webRequest `onCompleted`(`/i/api/graphql/*DeleteTweet*`)에서 `x-rate-limit-limit/-remaining/-reset` 파싱 → 대시보드에 `BUDGET` 메시지. 미관측 시 L=50·W=900·u=0.3 고정
- 하드 제약 상수: `HARD_MAX_UTIL=0.95` · `HARD_MAX_PER_DAY=8000` · 동시 1 (ADR-0008, u는 ADR-0011로 개정). 간격 하한 상수는 폐지 — 설정의 사용자 지정 간격이 0 초과인지만 검증한다(ADR-0013)
- `breaker.ts`: CLOSED →(429·차단 문구)→ COOLING(reset+5~15분, u−0.1) → 같은 날 2회 HALTED_HOURS(2~4h, u−0.1) → 3회 HALTED_TODAY · auth_redirect/lock → HALTED(사람 확인). 연속 오류로는 멈추지 않는다 — 그 글만 건너뛰고 다음으로 간다(2026-09-19)
- `scheduler.ts`: `(state, event, now) → (state, command)` 순수 함수. 대시보드가 command(navigate/execute/wait/stop)를 수행
- 하지 않는 것: UA·IP 변경, 재로그인, 위장 활동, 외부 전송(ADR-0007)

## 6. 가져오기·analyze
- 대시보드 파일 입력: zip(`fflate`로 `data/tweets*.js`·`data/account.js`만 추출) 또는 개별 파일. 첫 `=` 이후 JSON 파싱, 1,000건 단위 트랜잭션 저장
- 분류 규칙 SRS FR-02. `analyze` 집계: 유형별·연도별·미디어·프리셋별 소요. CSV 내보내기(Blob 다운로드)

## 7. 테스트
- 단위(Vitest): 파서(합성 fixture 3종) · 필터 조합 · pacing(속성: 어떤 설정·관측값에서도 간격 ≥5s, u ≤0.7, 일 ≤8,000; 분포 검정) · breaker 전이표 · scheduler 시나리오(재개·중복 0·예산 고갈 대기)
- 실행기: happy-dom에 X 글 페이지 DOM 스냅샷(개인정보 제거) 로드 → 단계별 셀렉터 동작 검증. X 변경 시 스냅샷 갱신
- 수동: M2 테스트 게시물 1건. 라이브 run은 사용자 요청 시만, 첫 실행 ≤50건

## 8. 개발 워크플로우·도구 역할 (이유)
| 도구 | 역할 | 이유 |
|---|---|---|
| Claude Code | 계획→구현→테스트→커밋 주도, 서브에이전트 조사·리뷰, 사용자 레벨 훅(tsc/eslint) | 설치된 유일한 에이전틱 CLI |
| ChatGPT/Codex | 마일스톤·PR 독립 리뷰(안전 엔진·실행기 중심) | 교차 모델 검증 |
| Perplexity | 라이브 실행 전 X 정책·차단 사례 재확인 | 웹 근거·인용 |
- 브랜치: M0~M1 `main` 직접, M2부터 마일스톤 브랜치 + PR. 검증 루프: 편집 → `tsc --noEmit` → eslint → vitest → 커밋
- 릴리스: `npm run zip` → `gh release create vX.Y.Z .output/*.zip` → 다른 PC는 zip 해제 후 로드

## 9. 마일스톤
| 단계 | 산출물 | 완료 기준 |
|---|---|---|
| M0 | 헌장·SRS·ADR·plan·tasks | 사용자 승인 |
| M1 스파이크 A | Node·WXT 골격, 가져오기, analyze | 실제 아카이브 3계정 보고서, 유형별 건수 확정 |
| M2 스파이크 B | 작업 탭·콘텐츠 스크립트·`ui-click` 1건 + 예산 헤더 실측 | 테스트 게시물 삭제 `ok`, 감사 로그 1행, L·W 기록 → SRS §6 표 확정 |
| M3 v1 | plan/run/일시정지/재개·페이싱·회로차단·설정·내보내기·릴리스 zip | 시나리오 테스트 전부 통과, 첫 주 운영 무사고 |
| M4 | `graphql-replay`, unretweet/unlike, 백그라운드(alarms) 모드, 아카이브 이후 보충 | 항목별 ADR |
| M5 v2 | LLM 분류 필터 | ADR |

## 10. 사용자 준비
- Node.js LTS 설치(winget `OpenJS.NodeJS.LTS`). M1 시작 시 함께 진행 가능
- Chrome `chrome://extensions` 개발자 모드 ON
- 삭제 연습용 게시물 1건(M2)
- 아카이브 zip은 확장 화면에서 파일 선택. 저장소에 넣지 않음
