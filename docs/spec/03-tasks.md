# 작업 목록 (Tasks)

- 상태: v0.1 · 2026-09-17 · plan v0.1 기준. 완료 시 `[x]` + 커밋 해시
- 규칙: 태스크 1개 = 커밋 1개 이상. 완료 기준(AC) 필수

## M0 계획
- [x] T00 헌장 v2·SRS v0.2·ADR-0001~0006·plan·tasks — 2026-09-17

## M1 스파이크 A — 골격·가져오기·analyze
- [x] T01 Node 24.19 설치 → WXT 0.21 react 템플릿 기반 골격(`srcDir: src`, 자동 임포트 끔), eslint 10/prettier/vitest 4 — `npm run build` 성공 — 0799f55
- [x] T02 manifest 권한 최소(host `https://x.com/*`, storage, tabs, scripting, unlimitedStorage). 생성된 manifest 확인 — 0799f55
- [x] T03 `core/models.ts` + `messaging/protocol.ts` — a7515af
- [x] T04 `core/archive/parse.ts`(parts 병합, account.js, 구형 접두어) — fixture 4종, 3만 건 합성 < 10s 테스트 통과 — 92b0181
- [x] T05 `platform/db.ts` IndexedDB 스키마 v1(7 스토어)·1,000건 청크 저장 + `archive-input.ts`(zip.js, ZIP64·선택 추출) — 재가져오기 중복 0 테스트 — 43d155d
- [x] T06 대시보드: 위험 고지·동의 → 가져오기(진행 표시) → analyze(유형·연도·미디어·프리셋별 소요) + CSV. 페이싱 산식 `core/pacing.ts` — 6336f86, 744fa1a. 실제 아카이브 보고서는 사용자 실행 대기
- [x] T07 README 설치(clone → `npm ci` → `npm run build` → 로드)·사용법·구조 — 3f46157. 새 PC 재현은 M3 릴리스 zip과 함께 검증
- 사용자 입력: Node 설치 동의, 아카이브 zip 선택(UI)

## M2 스파이크 B — 1건 삭제
- [x] T10 `background.ts` webRequest 관측(DeleteTweet 429 + `x-rate-limit-*`)·대시보드 열기 + `worker-tab.ts`(탭 생성·이동·메시지). 헤더 파싱 `core/ratelimit.ts` 테스트 — 1caf2fc, d56fbc3. 라이브 관측은 T14
- [x] T11 `xcom.content.ts` + `executors/ui-click.ts` 페이지 판정·twid 추출. DOM fixture 테스트 — f2d7489
- [x] T12 `ui-click` 삭제 시퀀스(caret→메뉴→확인, 라벨·타임아웃 설정) — happy-dom 전 단계·오류 분기 테스트 — f2d7489. 셀렉터는 조사 기준 best-effort, T14에서 실제 확인
- [x] T13 대시보드 "삭제 테스트" 화면(세션 확인·미리보기·단건 삭제, twid 일치 전 삭제 비활성) — 686e974. 라이브 실행은 사용자 승인+테스트 글 필요(T14)
- [x] T14 실계정 테스트 게시물 1건 삭제 성공(2026-09-17). 셀렉터 확정 → `docs/learn/x-web-client.md`. 커밋 ec84c67. (L·W·R 헤더 실측값은 사용자 확인 대기)
- 사용자 입력: 테스트 게시물 1건, 실행 승인

## M3 v1
- [x] T20 `core/filters.ts` 6조건(유형·기간·키워드·정규식·보존id·지표임계) 조합 + 테스트
- [x] T21 `core/pacing.ts` 런타임(워밍업 u·로그노멀 지터·4% 짧은 휴식(20~40s)·활동시간·예산 감시·하드 최소 5s(ADR-0008)) + 테스트
- [x] T22 `core/breaker.ts` 순수 reducer(429 cooling→halted_hours→halted, 잠금·연속오류 즉시 halted) + 전이 테스트
- [x] T23 scheduler + `platform/runner.ts` run 루프(일시정지·중지·재개, 강제 종료 후 pending 재개 중복 0) + jobs persistence 테스트 — 커밋들 참조
- [x] T24 계획 화면 `PlanRun`(필터 UI·실시간 대상 수·프리셋·예상 소요) → job 생성
- [x] T25 실행 화면 `LiveRun`: 삭제마다 실시간 1행 + `deleted N of M tweets` 카운터 + 진행바 + X 예산 표시(FR-11a). 감사 로그 IndexedDB 기록. [ ] JSONL/CSV 내보내기는 후속
- [x] T26 설정 화면(프리셋·활동 시간대·간격 하한) + 하드 상한 거부(10s 미만 저장 불가 테스트) — 10620ab. 실행기·라벨·셀렉터 설정은 후속
- [x] T26a 실행 화면 대기 사유·재개 시각 강조, 페이싱 간격을 cadence(시작 시각 간격)로 — d5d0475
- [x] T26b 삭제 순서(최신/과거) 선택 + ID 자릿수 보정 비교 `core/order.ts` — 5afc88f
- [ ] T27 시나리오 테스트(429 쿨다운·2회 하향·로그인 리다이렉트·연속 실패) — AC: 전부 통과
- [ ] T28 릴리스 `npm run zip` → GitHub Release v0.1.0 — AC: 다른 PC zip 로드
- [ ] T29 운영 문서 `docs/ops.md`(첫 주 절차, 잠금 대응) — AC: 사용자 검토
- 라이브 run은 사용자 요청 시. 첫 실행 ≤50건

## M4 확장 (항목별 ADR)
- [ ] T30 `executors/graphql-replay.ts` + 식별자 관찰 저장소
- [ ] T31 `unretweet`·`unlike` 액션
- [ ] T32 백그라운드(alarms) 모드
- [x] T33 아카이브 이후 게시물 보충(프로필 스캔) → T34 스윕 모드로 흡수(ADR-0009)
- [x] T34 스윕 모드(FR-18) — 6d8ff6d, a3f3a44, f834eaa. 라이브 검증 대기: `core/timeline.ts` 후보 선택 · `executors/timeline-scan.ts` DOM 수집 · 프로토콜 3종(세션·스캔·스크롤) · `platform/sweep.ts` 루프 · 스윕 화면 — AC: 세션 handle 자동 판정, handle 입력 확인 없이는 실행 불가, 리포스트 미삭제, 고정글 마지막

- [x] T35 스윕 보존 필터(FR-18a) — 라이브 검증 대기: `core/sweep-filter.ts` 판정 · `executors/timeline-scan.ts` 카드 신호 9종 · `components/FilterPanel.tsx` · 설정 저장 · 완료 판정 수정(처음 보는 카드가 있으면 계속 훑음) — AC: 보존 조건에 걸린 글 미삭제, 보존 글이 쌓여도 거짓 완료 없음, 실행 중 필터 잠금

- [x] T36 `rush` 폭주 프리셋(1초·u 0.95·워밍업/긴 휴식 없음, ADR-0011) + 실시간 기록에 본문 표시(FR-11a) — 라이브 검증 대기: 429 발생 시점·창 리셋 주기·잠금 여부 — AC: 예산 분산 산식을 건너뛰고 플로어(1초)로 달림, 기존 프리셋의 실질 최저 간격 불변, 설정 화면에 위험·총량 배너

- [x] T37 질주 1초 개정(ADR-0011 개정) + 스윕 필터 로드 실패 가드 — AC: 저장 필터를 읽기 전/실패 시 시작 불가, 실패 사유 표시, 기존 프리셋의 실질 최저 간격 불변

- [x] T38 보존 필터 통합(ADR-0012) — `core/keep-filter.ts`·능력 매트릭스 잠금 UI·되읽기 박스·홈 입구 대칭 — 라이브 검증 대기: 실제 아카이브의 hasMedia 분포, 잠금 줄이 실제로 읽히는지 — AC: 아카이브 모드에서 미디어 보존 가능, 못 쓰는 조건이 화면에서 사라지지 않음, 되읽기에 없는 조건은 적용되지 않음

- [x] T39 삭제 간격 사용자 지정(ADR-0013) — 간격 하한 폐지, `withCustomInterval`로 분산·워밍업·긴 휴식 생략 — 라이브 검증 대기: 1초 미만에서 429 발생 시점·잠금 여부 — AC: 0.3 입력 시 실제 300ms, 0 이하는 저장 거부, 예상 소요가 지정 간격을 반영

- [x] T41 연속 오류 자동 중지 폐지 — 오류가 나도 그 글만 건너뛰고 계속 간다. 완료 직전 requeueFailed(아카이브)·skip 재훑기 3라운드(스윕)로 건너뛴 글을 이 실행 안에서 다시 집는다 — AC: 연속 오류로 멈추지 않음, 건너뛴 글이 완료 전에 재시도됨, 재시도는 유한

- [x] T42 읽기 한도 관측·페이지 단위 장애 백오프(ADR-0014) — 라이브 검증 대기: 읽기 버킷 실제 한도, 백오프 뒤 복구 여부 — AC: 삭제 경로 GraphQL 연산의 예산 관측(T43에서 범위 한정), 페이지 장애가 attempts를 깎지 않음, 장애 시 중지 대신 1→2→5→15분 대기

- [x] T44 스윕 스캔 페이지를 "전체" 탭으로·리포스트 재게시 취소(ADR-0016) — 라이브 검증 대기: 전체 탭에서 삭제·재게시 취소가 연속으로 도는지, 탭이 풀리지 않는지 — AC: 기본 스캔 페이지가 /<handle>/all, 멘션만 포함일 때만 /with_replies, 주소가 그 탭이 아니면 중지, 내 리포스트는 unretweetConfirm으로 취소, 남의 리포스트는 손대지 않음

- [x] T43 예산 감시를 삭제 경로로 한정·리셋 시각 준수(ADR-0015) — 라이브 검증 대기: 화이트리스트가 실제 삭제 흐름의 연산을 다 덮는지 — AC: 삭제와 무관한 연산(CreatorStudioTabBarItemQuery 등)의 한도가 실행을 막지 않음, 예산 소진 대기가 관측한 x-rate-limit-reset 시각까지만 지속

## M5 v2
- [ ] T40 LLM 분류 필터
