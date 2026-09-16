// 대시보드 ↔ 서비스 워커 ↔ 콘텐츠 스크립트 메시지. 모든 메시지는 여기 타입으로만 만든다 (plan §3).
import type { ExecutionResult } from '../core/models';

export type DashboardToBackground =
  | { type: 'OPEN_DASHBOARD' }
  | { type: 'PROBE_SESSION' }
  | { type: 'ENSURE_WORKER_TAB' }
  | { type: 'NAVIGATE'; tabId: number; url: string };

export type SessionProbe = { loggedIn: false } | { loggedIn: true; userId: string };

export type BackgroundToDashboard =
  | { type: 'SESSION'; probe: SessionProbe }
  | { type: 'WORKER_TAB'; tabId: number }
  | { type: 'NET_SIGNAL'; kind: 'rate_limit' | 'auth_redirect'; at: string }
  | { type: 'RESULT'; postId: string; result: ExecutionResult };

export type Message = DashboardToBackground | BackgroundToDashboard;

export function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}
