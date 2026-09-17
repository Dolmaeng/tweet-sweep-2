// 실행 루프 (plan §5, ADR-0004). 결정은 코어(scheduler·breaker·pacing)에 위임하고,
// 이 파일은 작업 탭 구동·저장·이벤트 방출만 한다. 대시보드가 열려 있는 동안만 돈다.
import {
  initialBreaker,
  reduceBreaker,
  type BreakerEvent,
  type BreakerState,
} from '../core/breaker';
import type { DeleteOrder, ExecutionResult, Job, Signal } from '../core/models';
import { coerceOrder } from '../core/order';
import { HARD_MIN_DELAY_MS, PRESETS, type RateBudget } from '../core/pacing';
import { decide, pacingDelayMs, type RunSnapshot } from '../core/scheduler';
import { statusUrl } from '../core/xurl';
import { DEFAULT_UI_CONFIG } from '../executors/types';
import {
  getPostText,
  itemStatusOf,
  markItem,
  nextPending,
  pendingCount,
  requeueFailed,
  setJobStatus,
} from './db';
import { deleteOnTab, ensureWorker, navigate, probeSettled, type Worker } from './worker-tab';

export interface RunControls {
  isPaused(): boolean;
  isStopped(): boolean;
}

export interface BudgetSnapshot {
  budget: RateBudget;
  remaining: number | null;
  /** 지난 호출 이후 429가 있었으면 true(소비). */
  takeRateLimit(): boolean;
}

export type RunEvent =
  | {
      type: 'item';
      postId: string;
      /** 인벤토리에 보존해 둔 본문. 실시간 기록에 함께 보여준다 */
      text: string;
      result: ExecutionResult;
      removedCount: number;
      at: number;
    }
  | { type: 'waiting'; reason: string; untilMs: number }
  /** 한 건 처리 후 다음 삭제까지 페이싱 수면 */
  | { type: 'sleeping'; untilMs: number }
  | { type: 'running' }
  | { type: 'ended'; reason: string; completed: boolean };

export interface RunContext {
  job: Job;
  username: string;
  activeStartHour: number;
  activeEndHour: number;
  /** 사용자 지정 간격 플로어(ms). 프리셋 플로어보다 클 때만 의미 있음 */
  floorMs?: number;
}

const MAX_WAIT_SLICE = 60_000;

export async function runJob(
  ctx: RunContext,
  controls: RunControls,
  budgetSource: () => BudgetSnapshot,
  onEvent: (ev: RunEvent) => void,
): Promise<void> {
  let breaker: BreakerState = initialBreaker;
  let deletedSoFar = ctx.job.removedCount;
  const order: DeleteOrder = coerceOrder(ctx.job.order);
  const base = PRESETS[ctx.job.preset];
  const preset = ctx.floorMs ? { ...base, floorMs: Math.max(base.floorMs, ctx.floorMs) } : base;
  let worker: Worker | null = null;

  await requeueFailed(ctx.job.id);
  await setJobStatus(ctx.job.id, 'running');
  onEvent({ type: 'running' });

  for (;;) {
    if (controls.isStopped()) {
      await setJobStatus(ctx.job.id, 'paused');
      onEvent({ type: 'ended', reason: '사용자 중지', completed: false });
      return;
    }

    const pending = await pendingCount(ctx.job.id);
    const { budget, remaining, takeRateLimit } = budgetSource();
    const snap: RunSnapshot = {
      pending,
      deletedSoFar,
      breaker,
      budget,
      remaining,
      preset,
      activeStartHour: ctx.activeStartHour,
      activeEndHour: ctx.activeEndHour,
      paused: controls.isPaused(),
    };
    const cmd = decide(snap, Date.now());

    if (cmd.type === 'done') {
      await setJobStatus(ctx.job.id, 'completed');
      onEvent({ type: 'ended', reason: '완료', completed: true });
      return;
    }
    if (cmd.type === 'stop') {
      await setJobStatus(ctx.job.id, 'halted');
      onEvent({ type: 'ended', reason: cmd.reason, completed: false });
      return;
    }
    if (cmd.type === 'wait') {
      onEvent({ type: 'waiting', reason: cmd.reason, untilMs: cmd.untilMs });
      await sleep(Math.min(cmd.untilMs - Date.now(), MAX_WAIT_SLICE), controls);
      continue;
    }

    // cmd.type === 'delete'
    const postId = await nextPending(ctx.job.id, order);
    if (postId === null) continue;

    const text = await getPostText(ctx.job.userId, postId);
    const startedAt = Date.now();
    let result: ExecutionResult;
    try {
      worker = await ensureWorker(worker);
      await navigate(worker.tabId, statusUrl(ctx.username, postId));
      await probeSettled(worker.tabId);
      result = await deleteOnTab(worker.tabId, postId, DEFAULT_UI_CONFIG);
    } catch (e) {
      result = { kind: 'error', signal: 'unknown_error', detail: (e as Error).message };
      worker = null; // 다음 회차에 창을 다시 연다
    }

    const removed = result.kind === 'ok' || result.kind === 'gone';
    const signal: Signal | null = 'signal' in result ? result.signal : null;
    const removedCount = await markItem(ctx.job.id, postId, itemStatusOf(result), signal, removed);
    if (removed) deletedSoFar = removedCount;

    // 백그라운드가 429를 봤으면 그것이 우선(rate-limit 회로차단)
    const event: BreakerEvent = takeRateLimit()
      ? { type: 'rate_limit', resetMs: budget.windowSec * 1000 }
      : toBreakerEvent(result);
    breaker = reduceBreaker(breaker, event, Date.now());

    onEvent({ type: 'item', postId, text, result, removedCount, at: Date.now() });

    // 간격은 '시작 시각 간 간격'(cadence). 탐색·클릭에 쓴 시간을 빼되 하드 최소는 지킨다
    const elapsed = Date.now() - startedAt;
    const delay = Math.max(HARD_MIN_DELAY_MS - elapsed, pacingDelayMs(snap) - elapsed, 0);
    onEvent({ type: 'sleeping', untilMs: Date.now() + delay });
    await sleep(delay, controls);
  }
}

function toBreakerEvent(result: ExecutionResult): BreakerEvent {
  switch (result.kind) {
    case 'ok':
      return { type: 'ok' };
    case 'gone':
      return { type: 'gone' };
    case 'blocked':
      return { type: 'blocked', signal: result.signal };
    case 'error':
      return { type: 'error' };
  }
}

/** 중단 신호에 반응하는 분할 수면 */
async function sleep(ms: number, controls: RunControls): Promise<void> {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    if (controls.isStopped()) return;
    await new Promise((r) => setTimeout(r, Math.min(500, end - Date.now())));
  }
}
