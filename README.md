# tweet-sweep-2

로그인한 X(구 Twitter) 브라우저 세션 안에서 내 게시물을 **사람보다 느리게** 자동 삭제하는 개인용 Chrome 확장 프로그램(MV3). 서버 없음, 비용 0원.

- 저장소 https://github.com/Dolmaeng/tweet-sweep-2 · MIT
- 전작 `tweet-sweep`(공식 API 방식)은 비용 문제로 보류. 이 프로젝트가 후속

## 위험 고지

- X 약관의 자동화 제한에 저촉될 수 있고 계정이 일시 잠길 수 있다. 사용자는 이를 알고 선택했다 → `docs/adr/0001`
- 완화 원칙: 사람 행동 모사(실제 버튼 클릭), 관측한 한도의 일부만 사용, 무작위 간격, 차단 신호 즉시 중단 → `docs/spec/00-constitution.md`, `docs/adr/0007`

## 상태

- M1 완료(2026-09-17): 아카이브 가져오기 · 분석 보고서 · CSV. 삭제 기능은 아직 없다
- 다음 M2: 테스트 게시물 1건 삭제 스파이크 · 진행 `docs/spec/03-tasks.md`

## 설치

### 개발 (Node.js 20+)

```bash
git clone https://github.com/Dolmaeng/tweet-sweep-2.git
cd tweet-sweep-2
npm ci
npm run build          # → .output/chrome-mv3
```

1. Chrome `chrome://extensions` → 개발자 모드 켜기
2. "압축해제된 확장 프로그램을 로드합니다" → `.output/chrome-mv3` 선택
3. 툴바의 확장 아이콘 클릭 → 대시보드 탭이 열린다

`npm run dev`는 확장을 자동 로드한 별도 Chrome 창을 띄우고 코드 변경을 즉시 반영한다(임시 프로필이라 X 로그인은 따로).

### 사용 (Node 없이)

- GitHub Release의 zip을 풀어 위 2단계부터 진행한다 (M3부터 제공)

## 사용법 (M1)

1. X 설정 → 계정 → 데이터 아카이브 다운로드 → zip 확보
2. 대시보드 → 위험 고지 동의 → "아카이브 가져오기" → zip 선택 (또는 압축 해제 후 `data/tweets*.js` + `data/account.js` 선택)
3. 분석 화면에서 유형별 건수·연도별 분포·속도별 예상 소요 확인, CSV 내보내기

- 읽는 파일은 `tweets*.js`, `account.js`뿐이다. DM·미디어는 열지 않는다
- 아카이브 zip은 저장소 폴더에 두지 않는다 (`/data/`는 커밋 제외)

## 개발 명령

| 명령                 | 내용                                  |
| -------------------- | ------------------------------------- |
| `npm run check`      | 타입 검사 + lint + 포맷 검사 + 테스트 |
| `npm test`           | vitest                                |
| `npm run build:edge` | Edge용 빌드 (`.output/edge-mv3`)      |
| `npm run zip`        | 배포용 zip (`.output/*.zip`)          |

## 문서 지도

| 경로                           | 내용                                                    |
| ------------------------------ | ------------------------------------------------------- |
| `docs/spec/00-constitution.md` | 헌장 v2.0                                               |
| `docs/spec/01-requirements.md` | 요구사항 명세(SRS)                                      |
| `docs/spec/02-plan.md`         | 구현 계획(구조·데이터·메시지·실행기·안전 엔진·마일스톤) |
| `docs/spec/03-tasks.md`        | 작업 목록·완료 기준                                     |
| `docs/adr/`                    | 아키텍처 결정 기록 0001~0007                            |
| `docs/log/`                    | 작업 로그                                               |
| `docs/learn/`                  | 조사 노트(X 웹 클라이언트, Chrome MV3, 비용 비교)       |

## 구조

```
src/core/        순수 TS: 모델, 아카이브 파서, 페이싱 산식 (브라우저 API 무의존, eslint로 강제)
src/platform/    브라우저 전용: IndexedDB, zip 입력, 가져오기 파이프라인, 설정
src/entrypoints/ background(서비스 워커) · xcom.content(x.com) · dashboard(React)
tests/           vitest (fixtures는 합성 데이터)
```
