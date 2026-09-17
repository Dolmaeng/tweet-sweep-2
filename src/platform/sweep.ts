// 스윕 실행 루프 (FR-18, ADR-0009). 아카이브 없이 타임라인 맨 위부터 지운다.
// 안전 결정(페이싱·회로차단·활동 시간대·예산)은 아카이브 모드와 같은 코어를 그대로 쓴다.
import {
  initialBreaker,
  reduceBreaker,
  type BreakerEvent,
  type BreakerState,
} from '../core/breaker';
import type { ExecutionResult, Job, Signal } from '../core/models';
import { HARD_MIN_DELAY_MS, PRESETS } from '../core/pacing';
import { decide, pacingDelayMs, type RunSnapshot } from '../core/scheduler';
import { isExcluded, isFilterActive, type SweepFilter } from '../core/sweep-filter';
import { nextRecovery, pickSweepTarget } from '../core/timeline';
import { withRepliesUrl } from '../core/xurl';
import { DEFAULT_UI_CONFIG } from '../executors/types';
import { appendAudit, itemStatusOf, upsertJobItem, setJobStatus } from './db';
import type { BudgetSnapshot, RunControls } from './runner';
import {
  deleteOnTab,
  ensureWorker,
  navigate,
  probeSettled,
  reloadTab,
  scanOnTab,
  scrollOnTab,
  sessionUsername,
  type Worker,
} from './worker-tab';

export type SweepEvent =
  | { type: 'running' }
  | { type: 'item'; postId: string; result: ExecutionResult; deleted: number; at: number }
  | { type: 'waiting'; reason: string; untilMs: number }
  | { type: 'sleeping'; untilMs: number }
  /** 후보를 못 찾아 스크롤·새로고침으로 더 불러오는 중 */
  | { type: 'searching'; note: string }
  | { type: 'ended'; reason: string; completed: boolean };

export interface SweepContext {
  job: Job;
  /** 세션에서 읽은 handle. 사용자 입력이 아니다 */
  username: string;
  /** 보존 필터(FR-18a). 걸리는 카드는 후보에서 뺀다 */
  filter: SweepFilter;
  activeStartHour: number;
  activeEndHour: number;
  floorMs?: number;
}

const MAX_WAIT_SLICE = 60_000;

export async function runSweep(
  ctx: SweepContext,
  controls: RunControls,
  budgetSource: () => BudgetSnapshot,
  onEvent: (ev: SweepEvent) => void,
): Promise<void> {
  let breaker: BreakerState = initialBreaker;
  let deleted = ctx.job.removedCount;
  const base = PRESETS[ctx.job.preset];
  const preset = ctx.floorMs ? { ...base, floorMs: Math.max(base.floorMs, ctx.floorMs) } : base;

  let worker: Worker | null = null;
  let onTimeline = false;
  let scrolledAway = false;
  let emptyStreak = 0;
  /** 시도했지만 못 지운 글. 같은 카드를 무한히 다시 집지 않게 한다 */
  const skip = new Set<string>();
  /** 이번 실행에서 한 번이라도 스캔한 글. 스크롤이 새 카드를 불러왔는지 판정한다 */
  const seen = new Set<string>();
  const filtered = isFilterActive(ctx.filter);

  await setJobStatus(ctx.job.id, 'running');
  onEvent({ type: 'running' });

  for (;;) {
    if (controls.isStopped()) {
      await setJobStatus(ctx.job.id, 'paused');
      onEvent({ type: 'ended', reason: '사용자 중지', completed: false });
      return;
    }

    const { budget, remaining, takeRateLimit } = budgetSource();
    const snap: RunSnapshot = {
      // 남은 수를 알 수 없다. 타임라인이 비었을 때만 완료로 판정한다(아래 nextRecovery)
      pending: 1,
      deletedSoFar: deleted,
      breaker,
      budget,
      remaining,
      preset,
      activeStartHour: ctx.activeStartHour,
      activeEndHour: ctx.activeEndHour,
      paused: controls.isPaused(),
    };
    const cmd = decide(snap, Date.now());

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
    if (cmd.type === 'done') {
      await setJobStatus(ctx.job.id, 'completed');
      onEvent({ type: 'ended', reason: '완료', completed: true });
      return;
    }

    const startedAt = Date.now();
    let result: ExecutionResult;
    let targetId: string | null = null;
    try {
      const w = await ensureWorker(worker);
      if (w !== worker) {
        worker = w;
        onTimeline = false;
      }
      if (!onTimeline) {
        await navigate(w.tabId, withRepliesUrl(ctx.username));
        const probe = await probeSettled(w.tabId);
        if (probe.pageKind === 'login') {
          await setJobStatus(ctx.job.id, 'halted');
          onEvent({ type: 'ended', reason: '로그인이 풀렸습니다', completed: false });
          return;
        }
        if (probe.pageKind === 'locked') {
          await setJobStatus(ctx.job.id, 'halted');
          onEvent({ type: 'ended', reason: '계정 잠금 화면', completed: false });
          return;
        }
        // 세션 계정이 바뀌었으면 즉시 중단(다른 계정을 지우는 사고 방지)
        const who = await sessionUsername(w.tabId);
        if (who && who.toLowerCase() !== ctx.username.toLowerCase()) {
          await setJobStatus(ctx.job.id, 'halted');
          onEvent({
            type: 'ended',
            reason: `로그인 계정이 @${who}로 바뀌었습니다`,
            completed: false,
          });
          return;
        }
        onTimeline = true;
        scrolledAway = false;
      }

      const items = await scanOnTab(w.tabId);
      const fresh = items.some((i) => !seen.has(i.postId));
      for (const i of items) seen.add(i.postId);
      const target = pickSweepTarget(
        items.filter((i) => !isExcluded(i, ctx.filter)),
        ctx.username,
        skip,
      );

      if (!target) {
        // 처음 보는 카드가 올라왔다면 아직 타임라인을 다 훑지 못한 것이다. 보존한 글이
        // 위에 쌓이면 후보 없는 화면이 계속 나오므로, 이걸 완료로 읽으면 안 된다.
        emptyStreak = fresh ? 0 : emptyStreak + 1;
        const recovery = nextRecovery(emptyStreak);
        if (recovery === 'done') {
          await setJobStatus(ctx.job.id, 'completed');
          onEvent({ type: 'ended', reason: '더 지울 글이 없습니다', completed: true });
          return;
        }
        if (recovery === 'reload') {
          onEvent({ type: 'searching', note: '타임라인 새로고침' });
          await reloadTab(w.tabId);
          await probeSettled(w.tabId);
          scrolledAway = false;
        } else {
          onEvent({ type: 'searching', note: '더 불러오는 중' });
          await scrollOnTab(w.tabId, 'more');
          scrolledAway = true;
        }
        await sleep(1500, controls);
        continue;
      }

      emptyStreak = 0;
      targetId = target.postId;
      result = await deleteOnTab(w.tabId, target.postId, DEFAULT_UI_CONFIG);
      await appendAudit({
        ts: new Date().toISOString(),
        jobId: ctx.job.id,
        postId: target.postId,
        executor: 'ui-click',
        result: result.kind,
        signal: 'signal' in result ? result.signal : null,
        durationMs: Date.now() - startedAt,
        text: target.text,
        createdAt: target.createdAt,
      });
    } catch (e) {
      result = { kind: 'error', signal: 'unknown_error', detail: (e as Error).message };
      worker = null;
      onTimeline = false;
    }

    if (targetId !== null) {
      const removed = result.kind === 'ok' || result.kind === 'gone';
      const signal: Signal | null = 'signal' in result ? result.signal : null;
      deleted = await upsertJobItem(ctx.job.id, targetId, itemStatusOf(result), signal, removed);
      if (!removed) skip.add(targetId);

      const event: BreakerEvent = takeRateLimit()
        ? { type: 'rate_limit', resetMs: budget.windowSec * 1000 }
        : toBreakerEvent(result);
      breaker = reduceBreaker(breaker, event, Date.now());

      onEvent({ type: 'item', postId: targetId, result, deleted, at: Date.now() });

      // 아래로 내려가 있었다면 맨 위로 돌아가 최신부터 유지한다.
      // 필터가 켜져 있으면 보존한 글이 맨 위에 영구히 쌓인다. 돌아가면 그 벽을 매번
      // 다시 스크롤해야 하므로, 그때는 있던 자리에서 이어간다.
      if (removed && scrolledAway && !filtered && worker) {
        try {
          await scrollOnTab(worker.tabId, 'top');
          scrolledAway = false;
        } catch {
          onTimeline = false;
        }
      }
    }

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

async function sleep(ms: number, controls: RunControls): Promise<void> {
  const endAt = Date.now() + Math.max(0, ms);
  while (Date.now() < endAt) {
    if (controls.isStopped()) return;
    await new Promise((r) => setTimeout(r, Math.min(500, endAt - Date.now())));
  }
}
