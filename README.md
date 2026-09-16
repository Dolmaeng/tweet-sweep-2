# tweet-sweep-2

로그인한 X(구 Twitter) 브라우저 세션 안에서 내 게시물을 **사람보다 느리게** 자동 삭제하는 개인용 Chrome 확장 프로그램(MV3). 서버 없음, 비용 0원.

- 저장소 https://github.com/Dolmaeng/tweet-sweep-2 · MIT
- 전작 `tweet-sweep`(공식 API 방식)은 비용 문제로 보류. 이 프로젝트가 후속

## 위험 고지

- X 약관의 자동화 제한에 저촉될 수 있고 계정이 일시 잠길 수 있다. 사용자는 이를 알고 선택했다 → `docs/adr/0001`
- 완화 원칙: 사람 행동 모사(실제 버튼 클릭), 무작위 간격, 일일 상한, 차단 신호 즉시 중단 → `docs/spec/00-constitution.md`

## 상태

- M0 계획 완료(2026-09-17). 코드 없음. 다음: M1 WXT 골격·아카이브 가져오기·analyze
- 스택: WXT + TypeScript + React · 실행기 `ui-click` 기본 · 진행 `docs/spec/03-tasks.md`

## 설치 (M1 이후 확정)

- 개발: Node.js LTS → `npm ci` → `npm run dev`(Chrome 자동 로드)
- 사용: GitHub Release zip 해제 → `chrome://extensions` 개발자 모드 → 압축해제된 확장 로드
- 아카이브 zip은 확장 화면에서 파일 선택으로만 읽는다. 저장소에 넣지 않는다

## 문서 지도

| 경로                           | 내용                                                    |
| ------------------------------ | ------------------------------------------------------- |
| `docs/spec/00-constitution.md` | 헌장 v2.0                                               |
| `docs/spec/01-requirements.md` | 요구사항 명세(SRS)                                      |
| `docs/spec/02-plan.md`         | 구현 계획(구조·데이터·메시지·실행기·안전 엔진·마일스톤) |
| `docs/spec/03-tasks.md`        | 작업 목록·완료 기준                                     |
| `docs/adr/`                    | 아키텍처 결정 기록 0001~0006                            |
| `docs/log/`                    | 작업 로그                                               |
| `docs/learn/`                  | 조사 노트(X 웹 클라이언트, Chrome MV3, 비용 비교)       |
