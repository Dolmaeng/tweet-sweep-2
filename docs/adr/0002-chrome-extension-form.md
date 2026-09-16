# ADR-0002: 형태 — Chrome 확장 프로그램(MV3), 데스크톱 자동화 대신

- 상태: 확정 · 2026-09-17

## 맥락
- 세션 방식 구현 형태 후보: ① Chrome 확장 ② Electron 내장 브라우저(Cyd) ③ Python+Playwright가 별도 프로필 구동(트와플류)

## 결정
- ① Chrome 확장(Manifest V3). 사용자가 평소 쓰는 브라우저 프로필·로그인 세션 그대로 사용

## 이유
- 평소 기기·쿠키·IP와 동일 → "새 기기 로그인" 신호 없음. ②③은 새 브라우저 프로필 = 새 로그인
- 배포 단순: `chrome://extensions` 개발자 모드 → 압축해제된 확장 로드. 스토어 심사 불필요
- 웹 플랫폼 학습 목표에 직결(확장 API·DOM·메시징·IndexedDB·CSP)
- 사용자 요청이 "큐비처럼 크롬 확장"

## 대안과 기각 사유
| 대안 | 기각 사유 |
|---|---|
| Electron 앱 | 배포 무게, 새 프로필 로그인, 학습 초점 분산 |
| Python+Playwright | 새 프로필 로그인, Chromium 자동화 표식(navigator.webdriver 등) 위험 |

## 결과·후속
- MV3 제약(서비스 워커 30s 유휴 종료, alarms ≥30s) 수용 → ADR-0004
