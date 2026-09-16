# 작업 목록 (Tasks)

- 상태: v0.1 · 2026-09-17 · plan v0.1 기준. 완료 시 `[x]` + 커밋 해시
- 규칙: 태스크 1개 = 커밋 1개 이상. 완료 기준(AC) 필수

## M0 계획
- [x] T00 헌장 v2·SRS v0.2·ADR-0001~0006·plan·tasks — 2026-09-17

## M1 스파이크 A — 골격·가져오기·analyze
- [x] T01 Node 24.19 설치 → WXT 0.21 react 템플릿 기반 골격(`srcDir: src`, 자동 임포트 끔), eslint 10/prettier/vitest 4 — `npm run build` 성공 — 0799f55
- [x] T02 manifest 권한 최소(host `https://x.com/*`, storage, tabs, scripting, unlimitedStorage). 생성된 manifest 확인 — 0799f55
- [ ] T03 `core/models.ts` + `messaging/protocol.ts` — AC: tsc 통과, 단위 테스트
- [ ] T04 `core/archive/parse.ts`(zip·js, parts 병합, account.js) — AC: fixture 3종, 3만 건 합성 < 10s
- [ ] T05 `platform/db.ts` IndexedDB 스키마·청크 저장·집계 — AC: 재가져오기 중복 0
- [ ] T06 대시보드: 위험 고지·동의 → 가져오기 → analyze(유형·연도·미디어·프리셋별 소요) + CSV — AC: 실제 아카이브로 보고서
- [ ] T07 README 설치 3단계(clone → `npm ci` → `npm run build` → 로드) — AC: 새 PC 재현
- 사용자 입력: Node 설치 동의, 아카이브 zip 선택(UI)

## M2 스파이크 B — 1건 삭제
- [ ] T10 `background.ts`: 작업 탭 생성·이동, 메시지 중계, webRequest 관측(429/302 + `x-rate-limit-*` 예산 헤더) — AC: 모의 신호·헤더 파싱 단위 테스트
- [ ] T11 `xcom.content.ts`: 페이지 유형 판정(로그인/잠금/없음/글), twid 읽기 — AC: fixture DOM 판정 테스트
- [ ] T12 `executors/ui-click.ts` 단계 구현 + 셀렉터·라벨 설정 — AC: happy-dom 스냅샷에서 전 단계 통과
- [ ] T13 대시보드 "단건 실행" 화면(dry-run 기본, 라이브 토글) — AC: dry-run은 클릭 없이 단계 로그만
- [ ] T14 실계정 테스트 게시물 1건 삭제 — AC: `ok`, 감사 로그 1행, DOM 스냅샷 fixture 갱신, DeleteTweet 응답의 L·W·R 실측값 기록 → SRS §6 표 확정
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
