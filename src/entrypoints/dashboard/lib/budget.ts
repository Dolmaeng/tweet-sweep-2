import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { DEFAULT_BUDGET, type RateBudget } from '../../../core/pacing';
import type { BudgetSnapshot } from '../../../platform/runner';
import type { NetEvent } from '../../../messaging/protocol';

export interface BudgetView {
  limit: number;
  remaining: number | null;
  resetSec: number | null;
  updatedAt: string | null;
}

/**
 * 백그라운드의 webRequest 관측(BUDGET/RATE_LIMIT)을 구독한다.
 * runner에 넘길 budgetSource와, 화면 표시용 view를 함께 돌려준다.
 */
export function useBudget(): { view: BudgetView; source: () => BudgetSnapshot } {
  const [view, setView] = useState<BudgetView>({
    limit: DEFAULT_BUDGET.limit,
    remaining: null,
    resetSec: null,
    updatedAt: null,
  });
  const ref = useRef({
    limit: DEFAULT_BUDGET.limit,
    remaining: null as number | null,
    rateLimit: false,
  });

  useEffect(() => {
    const listener = (msg: unknown) => {
      const ev = msg as NetEvent;
      if (ev?.type === 'BUDGET') {
        ref.current.limit = ev.limit;
        ref.current.remaining = ev.remaining;
        setView({
          limit: ev.limit,
          remaining: ev.remaining,
          resetSec: ev.resetSec,
          updatedAt: ev.at,
        });
      } else if (ev?.type === 'RATE_LIMIT') {
        ref.current.rateLimit = true;
        setView((v) => ({ ...v, updatedAt: ev.at, remaining: 0 }));
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const source = (): BudgetSnapshot => {
    const budget: RateBudget = { limit: ref.current.limit, windowSec: DEFAULT_BUDGET.windowSec };
    return {
      budget,
      remaining: ref.current.remaining,
      takeRateLimit: () => {
        const hit = ref.current.rateLimit;
        ref.current.rateLimit = false;
        return hit;
      },
    };
  };

  return { view, source };
}
