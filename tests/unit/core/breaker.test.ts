import { describe, expect, it } from 'vitest';
import { initialBreaker, reduceBreaker, resetDaily } from '../../../src/core/breaker';

const NOW = 1_700_000_000_000;
const half = () => 0.5;

describe('reduceBreaker', () => {
  it('ok and gone reset consecutive errors and close', () => {
    const errored = reduceBreaker(initialBreaker, { type: 'error' }, NOW, half);
    expect(errored.consecutiveErrors).toBe(1);
    const ok = reduceBreaker(errored, { type: 'ok' }, NOW, half);
    expect(ok).toMatchObject({ status: 'closed', consecutiveErrors: 0 });
  });

  it('연속 오류로는 멈추지 않는다 — 세지기만 한다', () => {
    let s = initialBreaker;
    for (let i = 0; i < 10; i++) s = reduceBreaker(s, { type: 'error' }, NOW, half);
    expect(s).toMatchObject({ status: 'closed', consecutiveErrors: 10 });
  });

  it('halts immediately on auth/lock', () => {
    const locked = reduceBreaker(
      initialBreaker,
      { type: 'blocked', signal: 'account_locked' },
      NOW,
      half,
    );
    expect(locked).toMatchObject({ status: 'halted', reason: '계정 잠금 감지' });
    const login = reduceBreaker(
      initialBreaker,
      { type: 'blocked', signal: 'auth_redirect' },
      NOW,
      half,
    );
    expect(login.status).toBe('halted');
  });

  it('escalates rate-limits: cooling → halted_hours → halted', () => {
    const reset = 15 * 60_000;
    let s = reduceBreaker(initialBreaker, { type: 'rate_limit', resetMs: reset }, NOW, half);
    expect(s.status).toBe('cooling');
    // now + reset(15m) + rng(0.5→10m) = +25m
    expect(s.until).toBe(NOW + reset + 10 * 60_000);
    expect(s.blocksToday).toBe(1);

    s = reduceBreaker(s, { type: 'rate_limit', resetMs: reset }, NOW, half);
    expect(s.status).toBe('halted_hours');
    expect(s.until).toBe(NOW + 3 * 60 * 60_000); // 2h + rng(0.5→1h)
    expect(s.blocksToday).toBe(2);

    s = reduceBreaker(s, { type: 'rate_limit', resetMs: reset }, NOW, half);
    expect(s.status).toBe('halted');
    expect(s.blocksToday).toBe(3);
  });

  it('resetDaily clears the daily block count', () => {
    const s = reduceBreaker(initialBreaker, { type: 'rate_limit', resetMs: 1000 }, NOW, half);
    expect(resetDaily(s).blocksToday).toBe(0);
  });
});
