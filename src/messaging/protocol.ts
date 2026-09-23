// 확장 내부 메시지 (plan §3). 대시보드(확장 페이지)가 작업 탭을 직접 몬다.
// 서비스 워커는 네트워크 관측과 대시보드 열기만 맡는다 (ADR-0004).
import type { ExecutionResult } from '../core/models';
import type { TimelineItem } from '../core/timeline';
import type { PageKind, UiClickConfig } from '../executors/types';
import type { SweepTab } from '../core/xurl';

export interface PageProbe {
  pageKind: PageKind;
  /** 세션 사용자 id (twid). 아카이브 accountId와 대조 (FR-03) */
  twid: string | null;
}

/** 스윕 모드에서 후보가 없을 때 페이지를 움직이는 방법 (FR-18) */
export type ScrollTo = 'top' | 'more';

/** 대시보드 → 콘텐츠 스크립트 (browser.tabs.sendMessage) */
export type ContentCommand =
  | { type: 'PROBE_PAGE' }
  | { type: 'DELETE_POST'; postId: string; config: UiClickConfig }
  /** 리포스트는 삭제가 아니라 재게시 취소다 (ADR-0016) */
  | { type: 'UNDO_REPOST'; postId: string; config: UiClickConfig }
  | { type: 'SESSION_INFO' }
  | { type: 'SCAN_TIMELINE' }
  /** 프로필 타임라인 탭을 맞춘다. sort는 실행당 한 번만 true (ADR-0016) */
  | { type: 'ENSURE_TAB'; tab: SweepTab; sort: boolean }
  | { type: 'SCROLL'; to: ScrollTo };

/** 콘텐츠 스크립트 → 대시보드 (sendMessage 응답) */
export type ContentReply =
  | { type: 'PROBE'; probe: PageProbe }
  | { type: 'DELETE'; result: ExecutionResult }
  | { type: 'SESSION'; username: string | null }
  | { type: 'SCAN'; items: TimelineItem[] }
  | { type: 'TAB'; tab: TabState }
  | { type: 'SCROLLED' };

/** 탭을 맞춘 결과. path가 사실상의 판정 근거이고 나머지는 진단이다 */
export interface TabState {
  /** 맞춰졌는가(탭 줄 기준) */
  ok: boolean;
  /** 맞춘 뒤의 location.pathname */
  path: string;
  /** 정렬을 최신순으로 바꿨는가 */
  sortChanged: boolean;
  detail: string;
}

/** 서비스 워커 → 대시보드 (runtime 브로드캐스트, webRequest 관측) */
export type NetEvent =
  // op = GraphQL 연산명. 삭제와 읽기는 한도 버킷이 달라 따로 센다 (2026-09-19)
  | { type: 'BUDGET'; op: string; limit: number; remaining: number; resetSec: number; at: string }
  | { type: 'RATE_LIMIT'; op: string; at: string };
