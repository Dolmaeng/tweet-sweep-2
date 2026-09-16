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
- [x] T21 `core/pacing.ts` 런타임(워밍업 u·로그노멀 지터·4% 긴 휴식·활동시간·예산 감시·하드 최소 10s) + 테스트
- [x] T22 `core/breaker.ts` 순수 reducer(429 cooling→halted_hours→halted, 잠금·연속오류 즉시 halted) + 전이 테스트
- [x] T23 scheduler + `platform/runner.ts` run 루프(일시정지·중지·재개, 강제 종료 후 pending 재개 중복 0) + jobs persistence 테스트 — 커밋들 참조
- [x] T24 계획 화면 `PlanRun`(필터 UI·실시간 대상 수·프리셋·예상 소요) → job 생성
- [x] T25 실행 화면 `LiveRun`: 삭제마다 실시간 1행 + `deleted N of M tweets` 카운터 + 진행바 + X 예산 표시(FR-11a). 감사 로그 IndexedDB 기록. [ ] JSONL/CSV 내보내기는 후속
- [ ] T26 설정 화면(프리셋·시간대·실행기·라벨·셀렉터) + 하드 상한 거부 — AC: 초과값 저장 불가
- [ ] T27 시나리오 테스트(429 쿨다운·2회 하향·로그인 리다이렉트·연속 실패) — AC: 전부 통과
- [ ] T28 릴리스 `npm run zip` → GitHub Release v0.1.0 — AC: 다른 PC zip 로드
- [ ] T29 운영 문서 `docs/ops.md`(첫 주 절차, 잠금 대응) — AC: 사용자 검토
- 라이브 run은 사용자 요청 시. 첫 실행 ≤50건

## M4 확장 (항목별 ADR)
- [ ] T30 `executors/graphql-replay.ts` + 식별자 관찰 저장소
- [ ] T31 `unretweet`·`unlike` 액션
- [ ] T32 백그라운드(alarms) 모드
- [ ] T33 아카이브 이후 게시물 보충(프로필 스캔)

## M5 v2
- [ ] T40 LLM 분류 필터
