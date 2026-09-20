// 스윕 실행 루프 (FR-18, ADR-0009). 아카이브 없이 타임라인 맨 위부터 지운다.
// 안전 결정(페이싱·회로차단·활동 시간대·예산)은 아카이브 모드와 같은 코어를 그대로 쓴다.
import {
  initialBreaker,
  reduceBreaker,
  type BreakerEvent,
  type BreakerState,
} from '../core/breaker';
import { pageBackoffMs } from '../core/backoff';
import { isPageLevelSignal } from '../core/models';
import type { ExecutionResult, Job, Signal } from '../core/models';
import { PRESETS, withCustomInterval } from '../core/pacing';
import { decide, pacingDelayMs, type RunSnapshot } from '../core/scheduler';
import { isFilterActive, isKeptSweep, type KeepFilter } from '../core/keep-filter';
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
  | {
      type: 'item';
      postId: string;
      /** 삭제 직전 카드에서 읽은 본문. 실시간 기록에 함께 보여준다 */
      text: string;
      result: ExecutionResult;
      deleted: number;
      at: number;
    }
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
  filter: KeepFilter;
  activeStartHour: number;
  activeEndHour: number;
  /** 사용자 지정 간격(초). 있으면 프리셋 대신 이 값으로 달린다 (ADR-0013) */
  intervalSec?: number | null;
}

const MAX_WAIT_SLICE = 60_000;

/** 건너뛴 카드를 다시 훑는 라운드 상한. 무한 재시도를 막는다 */
const SKIP_RETRY_ROUNDS = 3;

export async function runSweep(
  ctx: SweepContext,
  controls: RunControls,
  budgetSource: () => BudgetSnapshot,
  onEvent: (ev: SweepEvent) => void,
): Promise<void> {
  let breaker: BreakerState = initialBreaker;
  let deleted = ctx.job.removedCount;
  const base = PRESETS[ctx.job.preset];
  const preset = withCustomInterval(base, ctx.intervalSec ?? null);

  let worker: Worker | null = null;
  let onTimeline = false;
  let scrolledAway = false;
  let emptyStreak = 0;
  /** 시도했지만 못 지운 글. 같은 카드를 무한히 다시 집지 않게 한다 */
  const skip = new Set<string>();
  /** 건너뛴 카드를 다시 훑은 횟수 */
  let retryRounds = 0;
  /** 연속 페이지 장애 횟수. 백오프 단계를 정한다 (ADR-0014) */
  let pageFailStreak = 0;
  /** 이번 실행에서 한 번이라도 스캔한 글. 스크롤이 새 카드를 불러왔는지 판정한다 */
  const seen = new Set<string>();
  const filtered = isFilterActive(ctx.filter, 'sweep');

  await setJobStatus(ctx.job.id, 'running');
  onEvent({ type: 'running' });

  for (;;) {
    if (controls.isStopped()) {
      await setJobStatus(ctx.job.id, 'paused');
      onEvent({ type: 'ended', reason: '사용자 중지', completed: false });
      return;
    }

    const { budget, remaining, resetAtMs, takeRateLimit } = budgetSource();
    const snap: RunSnapshot = {
      // 남은 수를 알 수 없다. 타임라인이 비었을 때만 완료로 판정한다(아래 nextRecovery)
      pending: 1,
      deletedSoFar: deleted,
      breaker,
      budget,
      remaining,
      resetAtMs,
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
    let targetText = '';
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
        items.filter((i) => !isKeptSweep(i, ctx.filter)),
        ctx.username,
        skip,
      );

      if (!target) {
        // 처음 보는 카드가 올라왔다면 아직 타임라인을 다 훑지 못한 것이다. 보존한 글이
        // 위에 쌓이면 후보 없는 화면이 계속 나오므로, 이걸 완료로 읽으면 안 된다.
        emptyStreak = fresh ? 0 : emptyStreak + 1;
        const recovery = nextRecovery(emptyStreak);
        if (recovery === 'done') {
          // 오류로 건너뛴 카드를 다시 훑는다. 그러지 않으면 밤새 도는 동안 실패한 글이
          // 남은 채 "더 지울 글이 없습니다"가 된다. 라운드 상한이 있어 유한하다.
          if (skip.size > 0 && retryRounds < SKIP_RETRY_ROUNDS) {
            retryRounds += 1;
            onEvent({
              type: 'searching',
              note: `건너뛴 ${skip.size}건 다시 시도 (${retryRounds}/${SKIP_RETRY_ROUNDS})`,
            });
            skip.clear();
            seen.clear();
            emptyStreak = 0;
            await reloadTab(w.tabId);
            await probeSettled(w.tabId);
            scrolledAway = false;
            await sleep(1500, controls);
            continue;
          }
          await setJobStatus(ctx.job.id, 'completed');
          onEvent({
            type: 'ended',
            reason:
              skip.size > 0
                ? `더 지울 글이 없습니다 (${skip.size}건은 오류로 건너뜀)`
                : '더 지울 글이 없습니다',
            completed: true,
          });
          return;
        }
        if (recovery === 'reload') {
          onEvent({ type: 'searching', note: '타임라인 새로고침' });
          await reloadTab(w.tabId);
          // 새로고침해도 페이지가 글 화면이 아니면 타임라인 자체가 안 열린 것이다
          // (예산 소진 뒤의 "Something went wrong"). 이걸 "더 지울 글이 없음"으로
          // 읽으면 밤새 돌 작업이 조용히 끝나버린다 (ADR-0014)
          if ((await probeSettled(w.tabId)).pageKind === 'unknown') {
            emptyStreak = 0; // 글이 없는 게 아니라 화면이 없는 것이다
            pageFailStreak += 1;
            const backoff = pageBackoffMs(pageFailStreak);
            onEvent({
              type: 'waiting',
              reason: `타임라인을 열지 못했습니다 (${pageFailStreak}회 연속) — 물러나 대기`,
              untilMs: Date.now() + backoff,
            });
            onTimeline = false;
            await sleep(backoff, controls);
            continue;
          }
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
      targetText = target.text;
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

    // 페이지가 안 열린 건 이 글의 잘못이 아니다. 재시도 횟수도 깎지 않고, skip에도
    // 넣지 않는다 — 아래 백오프로 물러났다가 같은 글을 다시 집는다 (ADR-0014)
    const signal: Signal | null = 'signal' in result ? result.signal : null;
    const pageLevel = isPageLevelSignal(signal);

    if (targetId !== null) {
      const removed = result.kind === 'ok' || result.kind === 'gone';
      deleted = await upsertJobItem(
        ctx.job.id,
        targetId,
        itemStatusOf(result),
        signal,
        removed,
        !pageLevel,
      );
      if (!removed && !pageLevel) skip.add(targetId);

      const event: BreakerEvent = takeRateLimit()
        ? { type: 'rate_limit', resetMs: budget.windowSec * 1000 }
        : toBreakerEvent(result);
      breaker = reduceBreaker(breaker, event, Date.now());

      onEvent({
        type: 'item',
        postId: targetId,
        text: targetText,
        result,
        deleted,
        at: Date.now(),
      });

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

    // 페이지 장애가 이어지면 멈추지 않고 물러나 기다린다. 그냥 건너뛰면 창 예산이
    // 바닥난 동안 남은 글을 전부 실패로 소진한다 (ADR-0014)
    pageFailStreak = pageLevel ? pageFailStreak + 1 : 0;
    if (pageFailStreak > 0) {
      const backoff = pageBackoffMs(pageFailStreak);
      onEvent({
        type: 'waiting',
        reason: `페이지를 열지 못했습니다 (${pageFailStreak}회 연속) — 물러나 대기`,
        untilMs: Date.now() + backoff,
      });
      onTimeline = false; // 다시 열 때 타임라인부터 새로 연다
      await sleep(backoff, controls);
      continue;
    }

    // 간격은 시작 시각 간 간격(cadence). 탐색·클릭에 쓴 시간을 뺀다
    const elapsed = Date.now() - startedAt;
    const delay = Math.max(pacingDelayMs(snap) - elapsed, 0);
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
