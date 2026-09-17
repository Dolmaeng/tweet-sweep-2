import { describe, expect, it } from 'vitest';
import {
  isSweepCandidate,
  nextRecovery,
  pickSweepTarget,
  sameHandle,
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
  it('excludes reposts, other people posts, and already-failed ids', () => {
    expect(isSweepCandidate(card({ postId: '1' }), ME, new Set())).toBe(true);
    expect(isSweepCandidate(card({ postId: '2', repost: true }), ME, new Set())).toBe(false);
    expect(isSweepCandidate(card({ postId: '3', handle: 'someone' }), ME, new Set())).toBe(false);
    expect(isSweepCandidate(card({ postId: '4' }), ME, new Set(['4']))).toBe(false);
  });
});

describe('pickSweepTarget', () => {
  it('picks the newest of my own non-repost cards', () => {
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
