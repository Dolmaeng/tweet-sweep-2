// 확장 내부 메시지 (plan §3). 대시보드(확장 페이지)가 작업 탭을 직접 몬다.
// 서비스 워커는 네트워크 관측과 대시보드 열기만 맡는다 (ADR-0004).
import type { ExecutionResult } from '../core/models';
import type { PageKind, UiClickConfig } from '../executors/types';

export interface PageProbe {
  pageKind: PageKind;
  /** 세션 사용자 id (twid). 아카이브 accountId와 대조 (FR-03) */
  twid: string | null;
}

/** 대시보드 → 콘텐츠 스크립트 (browser.tabs.sendMessage) */
export type ContentCommand =
  { type: 'PROBE_PAGE' } | { type: 'DELETE_POST'; postId: string; config: UiClickConfig };

/** 콘텐츠 스크립트 → 대시보드 (sendMessage 응답) */
export type ContentReply =
  { type: 'PROBE'; probe: PageProbe } | { type: 'DELETE'; result: ExecutionResult };

/** 서비스 워커 → 대시보드 (runtime 브로드캐스트, webRequest 관측) */
export type NetEvent =
  | { type: 'BUDGET'; limit: number; remaining: number; resetSec: number; at: string }
  | { type: 'RATE_LIMIT'; at: string };
