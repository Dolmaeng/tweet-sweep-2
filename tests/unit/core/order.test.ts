import { describe, expect, it } from 'vitest';
import { coerceOrder, compareIds, pickNextPostId } from '../../../src/core/order';

// 실제 스노우플레이크: 18자리는 2017-11 이전, 19자리는 그 이후
const OLD_2016 = '795000000000000000';
const OLD_2017 = '934000000000000000';
const NEW_2024 = '1734511466424988056';
const NEWER_2024 = '1734511466424988057';

describe('compareIds', () => {
  it('orders by digit count first, so an 18-digit id is older than any 19-digit id', () => {
    // 문자열 비교였다면 '934…' > '1734…'로 뒤집힌다(과거 버그)
    expect(compareIds(OLD_2017, NEW_2024)).toBeLessThan(0);
    expect(OLD_2017 > NEW_2024).toBe(true);
  });

  it('orders same-length ids lexicographically and treats equals as 0', () => {
    expect(compareIds(NEW_2024, NEWER_2024)).toBeLessThan(0);
    expect(compareIds(NEWER_2024, NEW_2024)).toBeGreaterThan(0);
    expect(compareIds(NEW_2024, NEW_2024)).toBe(0);
    expect(compareIds('0099', '99')).toBe(0);
  });
});

describe('pickNextPostId', () => {
  const ids = [OLD_2017, NEW_2024, OLD_2016, NEWER_2024];

  it('picks the newest id first by default order', () => {
    expect(pickNextPostId(ids, 'newest')).toBe(NEWER_2024);
  });

  it('picks the oldest id when asked', () => {
    expect(pickNextPostId(ids, 'oldest')).toBe(OLD_2016);
  });

  it('returns null for an empty set and the single id otherwise', () => {
    expect(pickNextPostId([], 'newest')).toBeNull();
    expect(pickNextPostId([NEW_2024], 'oldest')).toBe(NEW_2024);
  });
});

describe('coerceOrder', () => {
  it('defaults to newest for missing or unknown values', () => {
    expect(coerceOrder(undefined)).toBe('newest');
    expect(coerceOrder('nonsense')).toBe('newest');
    expect(coerceOrder('oldest')).toBe('oldest');
  });
});
