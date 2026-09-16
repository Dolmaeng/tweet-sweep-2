# ADR-0006: 스택 — WXT + TypeScript + React, 릴리스 zip 배포

- 상태: 확정(Q1) · 2026-09-17

## 맥락
- Node 미설치. 사용자는 웹/프론트 학습과 향후 TS 확장 의향. 다른 PC에서 clone 후 사용 필요

## 결정
- WXT(Vite) + TypeScript. 대시보드 UI는 React. `core`는 프레임워크·브라우저 API 무의존 순수 TS
- 테스트 Vitest(+ happy-dom으로 실행기 DOM 로직). 린트·포맷 eslint + prettier
- 배포: `wxt zip` 산출물을 GitHub Release에 첨부 → 다른 PC는 Node 없이 zip 해제 후 로드. 개발 PC는 `npm run dev`
- Node.js LTS 설치(M1 첫 작업)

## 이유
- WXT: 2026 확장 개발 표준. manifest 생성·HMR·Chrome/Edge 빌드·타입 지원, 활발히 유지
- TypeScript: 메시지 프로토콜·상태기계·IndexedDB 스키마에 타입이 있어야 안전 엔진 회귀를 컴파일러가 잡음(하네스의 가이드 역할)
- React: 취업 시장 표준, 사용자의 후속 계획(TS/React 프론트)과 연결. 대시보드는 목록·진행률·설정 수준이라 학습 부담 적정
- 릴리스 zip: 이식성(P8)을 빌드 없이 충족

## 대안과 기각 사유
| 대안 | 기각 사유 |
|---|---|
| 바닐라 JS 무빌드 | 타입·테스트 부재, 학습 폭 좁음 |
| CRXJS | WXT보다 관례·문서 적음 |
| Svelte/Vue UI | 학습 가치 있으나 시장 비중은 React. core 분리로 교체 가능 |

## 결과·후속
- `02-plan.md`에 `entrypoints/` 구조·의존성 확정
