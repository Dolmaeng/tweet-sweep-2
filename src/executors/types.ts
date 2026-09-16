// 실행기 공통 타입 (ADR-0005). core에 두지 않는다: DOM/브라우저에 얽힌 개념.

/** 작업 탭이 현재 보여주는 페이지 종류 */
export type PageKind = 'tweet' | 'not_found' | 'login' | 'locked' | 'unknown';

export interface UiClickConfig {
  /** 삭제 메뉴 항목 라벨 후보(언어별). 설정에서 덮어쓸 수 있다 */
  labels: string[];
  timeouts: {
    /** 요소 등장 대기(ms) */
    element: number;
    /** 확인 시트 대기(ms) */
    confirm: number;
  };
}

export const DEFAULT_UI_CONFIG: UiClickConfig = {
  labels: ['삭제', 'Delete'],
  timeouts: { element: 10_000, confirm: 5_000 },
};
