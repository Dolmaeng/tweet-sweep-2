import { describe, expect, it } from 'vitest';
import {
  BUCKET_TTL_MS,
  freshBuckets,
  tightestBucket,
  type Bucket,
} from '../../../src/core/budget-buckets';

const NOW = 1_700_000_000_000;

function bucket(over: Partial<Bucket> & { op: string }): Bucket {
  return { limit: 200, remaining: 100, resetSec: 900, atMs: NOW, ...over };
}

describe('tightestBucket', () => {
  it('관측이 없으면 null — "한도 없음"이 아니라 "모름"이다', () => {
    expect(tightestBucket([], NOW)).toBeNull();
  });

  it('남은 비율이 가장 낮은 버킷을 고른다 — 절대 수치가 아니다', () => {
    const buckets = [
      bucket({ op: 'DeleteTweet', limit: 200, remaining: 60 }), // 30%
      bucket({ op: 'TweetDetail', limit: 50, remaining: 5 }), // 10%
    ];
    expect(tightestBucket(buckets, NOW)?.op).toBe('TweetDetail');
  });

  it('읽기 버킷이 먼저 바닥나는 상황을 잡아낸다 (2026-09-19 page:unknown)', () => {
    // 삭제는 아직 여유가 있는데 읽기가 0이면, 페이지가 안 열려 삭제도 못 한다
    const buckets = [
      bucket({ op: 'DeleteTweet', remaining: 150 }),
      bucket({ op: 'TweetDetail', remaining: 0 }),
    ];
    const worst = tightestBucket(buckets, NOW);
    expect(worst?.op).toBe('TweetDetail');
    expect(worst?.remaining).toBe(0);
  });
});

describe('freshBuckets', () => {
  it('창이 이미 리셋된 관측은 버린다', () => {
    const stale = bucket({ op: 'DeleteTweet', resetSec: 10 });
    expect(freshBuckets([stale], NOW + 11_000)).toEqual([]);
    expect(freshBuckets([stale], NOW + 5_000)).toHaveLength(1);
  });

  it('오래된 관측은 리셋 시각과 무관하게 버린다', () => {
    const old = bucket({ op: 'DeleteTweet', resetSec: 99_999 });
    expect(freshBuckets([old], NOW + BUCKET_TTL_MS + 1)).toEqual([]);
  });

  it('모두 만료되면 tightestBucket도 null', () => {
    expect(tightestBucket([bucket({ op: 'DeleteTweet', resetSec: 10 })], NOW + 60_000)).toBeNull();
  });
});
