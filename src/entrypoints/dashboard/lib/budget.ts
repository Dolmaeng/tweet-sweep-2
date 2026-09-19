import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { tightestBucket, type Bucket } from '../../../core/budget-buckets';
import { DEFAULT_BUDGET, type RateBudget } from '../../../core/pacing';
import type { BudgetSnapshot } from '../../../platform/runner';
import type { NetEvent } from '../../../messaging/protocol';

export interface BudgetView {
  limit: number;
  remaining: number | null;
  resetSec: number | null;
  updatedAt: string | null;
  /** 지금 발목을 잡고 있는 연산명. 관측 전이면 null */
  op: string | null;
}

const NO_VIEW: BudgetView = {
  limit: DEFAULT_BUDGET.limit,
  remaining: null,
  resetSec: null,
  updatedAt: null,
  op: null,
};

/**
 * 백그라운드의 webRequest 관측(BUDGET/RATE_LIMIT)을 구독한다.
 * 연산별로 따로 들고 있다가 가장 빡빡한 버킷을 실행 판단에 쓴다 (ADR-0014).
 */
export function useBudget(): { view: BudgetView; source: () => BudgetSnapshot } {
  const [view, setView] = useState<BudgetView>(NO_VIEW);
  const buckets = useRef(new Map<string, Bucket>());
  const rateLimit = useRef(false);

  useEffect(() => {
    const listener = (msg: unknown) => {
      const ev = msg as NetEvent;
      if (ev?.type === 'BUDGET') {
        buckets.current.set(ev.op, {
          op: ev.op,
          limit: ev.limit,
          remaining: ev.remaining,
          resetSec: ev.resetSec,
          atMs: Date.now(),
        });
      } else if (ev?.type === 'RATE_LIMIT') {
        rateLimit.current = true;
        // 429를 맞은 버킷은 잔여 0으로 못박는다. 헤더가 안 왔을 수도 있다
        const prev = buckets.current.get(ev.op);
        buckets.current.set(ev.op, {
          op: ev.op,
          limit: prev?.limit ?? DEFAULT_BUDGET.limit,
          remaining: 0,
          resetSec: prev?.resetSec ?? DEFAULT_BUDGET.windowSec,
          atMs: Date.now(),
        });
      } else {
        return;
      }
      const worst = tightestBucket([...buckets.current.values()], Date.now());
      setView(
        worst === null
          ? NO_VIEW
          : {
              limit: worst.limit,
              remaining: worst.remaining,
              resetSec: worst.resetSec,
              updatedAt: new Date().toISOString(),
              op: worst.op,
            },
      );
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const source = (): BudgetSnapshot => {
    const worst = tightestBucket([...buckets.current.values()], Date.now());
    const budget: RateBudget = {
      limit: worst?.limit ?? DEFAULT_BUDGET.limit,
      windowSec: DEFAULT_BUDGET.windowSec,
    };
    return {
      budget,
      remaining: worst?.remaining ?? null,
      takeRateLimit: () => {
        const hit = rateLimit.current;
        rateLimit.current = false;
        return hit;
      },
    };
  };

  return { view, source };
}
