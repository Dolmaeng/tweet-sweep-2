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
- [ ] T20 `core/filters/` 6종 + 조합 테스트
- [ ] T21 `core/pacing.ts` 적응형(예산 관측·u·로그노멀 지터·긴 휴식·워밍업·활동시간·하드 제약) — AC: 속성 테스트(간격 ≥10s, u ≤0.7, 일 ≤5,000), 분포 검정
- [ ] T22 `core/breaker.ts` 사다리식(429 1·2·3회, 인증·잠금, 연속 오류) — AC: 전이표 테스트
- [ ] T23 `core/scheduler.ts` + 대시보드 run 루프(일시정지·중단·재개) — AC: 강제 종료 후 중복 0
- [ ] T24 plan 화면(필터 UI·목록·CSV) — AC: dry-run 기본
- [ ] T25 감사 로그·내보내기(JSONL/CSV) + 실시간 피드(삭제마다 1행 즉시) + 카운터 `deleted N of M tweets`·잔여 예상·다음 실행 시각 — AC: 항목별 1행, 카운터가 결과 수신 즉시 갱신(FR-11a)
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
