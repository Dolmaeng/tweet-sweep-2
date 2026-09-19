import { describe, expect, it } from 'vitest';
import { PAGE_BACKOFF_MS, pageBackoffMs } from '../../../src/core/backoff';
import { isPageLevelSignal } from '../../../src/core/models';

describe('pageBackoffMs', () => {
  it('회차마다 길어지고 마지막 값에서 멈춘다', () => {
    expect(pageBackoffMs(1)).toBe(60_000);
    expect(pageBackoffMs(2)).toBe(120_000);
    expect(pageBackoffMs(4)).toBe(900_000);
    expect(pageBackoffMs(99)).toBe(PAGE_BACKOFF_MS.at(-1));
  });

  it('절대 0을 주지 않는다 — 0이면 장애 중에 큐를 태운다', () => {
    for (const n of [0, -1, 1, 7]) expect(pageBackoffMs(n)).toBeGreaterThan(0);
  });
});

describe('isPageLevelSignal', () => {
  it('페이지가 안 열린 것과 그 글이 이상한 것을 가른다', () => {
    expect(isPageLevelSignal('page_unavailable')).toBe(true);
    expect(isPageLevelSignal('unknown_error')).toBe(true);
    // 셀렉터가 바뀐 건 그 글에서 실제로 벌어진 일이다. 재시도 횟수를 세야 한다
    expect(isPageLevelSignal('dom_changed')).toBe(false);
    expect(isPageLevelSignal('account_locked')).toBe(false);
    expect(isPageLevelSignal(null)).toBe(false);
  });
});
