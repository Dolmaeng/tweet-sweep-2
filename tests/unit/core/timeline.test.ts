import { describe, expect, it } from 'vitest';
import {
  isSweepCandidate,
  nextRecovery,
  pickSweepTarget,
  sameHandle,
  sweepActionOf,
  type TimelineItem,
} from '../../../src/core/timeline';

const ME = 'gujik_man';

function card(p: Partial<TimelineItem> & { postId: string }): TimelineItem {
  return {
    handle: ME,
    pinned: false,
    repost: false,
    text: '',
    createdAt: null,
    reply: false,
    liked: false,
    hasLikes: false,
    retweeted: false,
    hasRetweets: false,
    bookmarked: false,
    hasBookmarks: false,
    ownMedia: false,
    hasMedia: false,
    ...p,
  };
}

describe('sameHandle', () => {
  it('ignores case and a leading @', () => {
    expect(sameHandle('@Gujik_Man', ME)).toBe(true);
    expect(sameHandle('other', ME)).toBe(false);
  });
});

describe('isSweepCandidate', () => {
  it('excludes other people posts and already-failed ids', () => {
    expect(isSweepCandidate(card({ postId: '1' }), ME, new Set())).toBe(true);
    expect(isSweepCandidate(card({ postId: '3', handle: 'someone' }), ME, new Set())).toBe(false);
    expect(isSweepCandidate(card({ postId: '4' }), ME, new Set(['4']))).toBe(false);
  });

  it('내가 누른 재게시는 대상이다 — handle이 원작성자여도 (ADR-0016)', () => {
    const mine = card({ postId: '2', repost: true, retweeted: true, handle: 'someone' });
    expect(isSweepCandidate(mine, ME, new Set())).toBe(true);
    expect(sweepActionOf(mine)).toBe('unrepost');
  });

  it('내가 누른 증거가 없는 리포스트 카드는 손대지 않는다', () => {
    // unretweet 버튼이 없으면 내 재게시가 아니다. 취소할 것이 없다
    const notMine = card({ postId: '5', repost: true, retweeted: false, handle: 'someone' });
    expect(isSweepCandidate(notMine, ME, new Set())).toBe(false);
  });

  it('리포스트가 아닌 카드는 여전히 handle이 나와 같아야 한다', () => {
    const theirs = card({ postId: '6', handle: 'someone', retweeted: true });
    expect(isSweepCandidate(theirs, ME, new Set())).toBe(false);
    expect(sweepActionOf(theirs)).toBe('delete');
  });
});

describe('pickSweepTarget', () => {
  it('picks the newest of my own cards, skipping other peoples reposts', () => {
    const items = [
      card({ postId: '1734000000000000009', handle: 'someone', repost: true }),
      card({ postId: '1734000000000000001' }),
      card({ postId: '1734000000000000005' }),
    ];
    expect(pickSweepTarget(items, ME)?.postId).toBe('1734000000000000005');
  });

  it('leaves a pinned post for last, taking it only when nothing else remains', () => {
    const pinned = card({ postId: '1734000000000000009', pinned: true });
    const normal = card({ postId: '1734000000000000001' });
    expect(pickSweepTarget([pinned, normal], ME)?.postId).toBe(normal.postId);
    expect(pickSweepTarget([pinned], ME)?.postId).toBe(pinned.postId);
  });

  it('returns null when every card is a repost or someone else', () => {
    const items = [card({ postId: '1', repost: true }), card({ postId: '2', handle: 'other' })];
    expect(pickSweepTarget(items, ME)).toBeNull();
    expect(pickSweepTarget([], ME)).toBeNull();
  });

  it('skips ids that already failed so the loop cannot stall on one card', () => {
    const items = [
      card({ postId: '1734000000000000009' }),
      card({ postId: '1734000000000000001' }),
    ];
    const skip = new Set(['1734000000000000009']);
    expect(pickSweepTarget(items, ME, skip)?.postId).toBe('1734000000000000001');
  });
});

describe('nextRecovery', () => {
  it('escalates scroll → reload → scroll → done', () => {
    expect(nextRecovery(1)).toBe('scroll');
    expect(nextRecovery(2)).toBe('scroll');
    expect(nextRecovery(3)).toBe('reload');
    expect(nextRecovery(4)).toBe('scroll');
    expect(nextRecovery(6)).toBe('scroll');
    expect(nextRecovery(7)).toBe('done');
  });
});
