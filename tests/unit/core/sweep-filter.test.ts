import { describe, expect, it } from 'vitest';
import {
  coerceSweepFilter,
  isExcluded,
  isFilterActive,
  isMention,
  keywordList,
  NO_SWEEP_FILTER,
  KEYWORDS_MAX,
  type SweepFilter,
} from '../../../src/core/sweep-filter';
import type { TimelineItem } from '../../../src/core/timeline';

function card(p: Partial<TimelineItem> = {}): TimelineItem {
  return {
    postId: '1',
    handle: 'gujik_man',
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

function filter(p: Partial<SweepFilter> = {}): SweepFilter {
  return { ...NO_SWEEP_FILTER, ...p };
}

describe('keywordList', () => {
  it('splits on commas, trims, lowercases and drops blanks', () => {
    expect(keywordList(' 큐비, 트청 ,, Cyd ')).toEqual(['큐비', '트청', 'cyd']);
    expect(keywordList('   ')).toEqual([]);
  });
});

describe('isMention', () => {
  it('counts replies and posts whose body starts with @', () => {
    expect(isMention(card({ reply: true }))).toBe(true);
    expect(isMention(card({ text: '  @someone 안녕' }))).toBe(true);
    expect(isMention(card({ text: '안녕 @someone' }))).toBe(false);
  });
});

describe('isExcluded — 멘션 필터', () => {
  it('keeps everything by default', () => {
    expect(isExcluded(card({ reply: true }), NO_SWEEP_FILTER)).toBe(false);
    expect(isExcluded(card({ liked: true, hasMedia: true }), NO_SWEEP_FILTER)).toBe(false);
  });

  it('only: drops non-mentions', () => {
    const f = filter({ mention: 'only' });
    expect(isExcluded(card({ text: '혼잣말' }), f)).toBe(true);
    expect(isExcluded(card({ reply: true }), f)).toBe(false);
  });

  it('exclude: drops mentions', () => {
    const f = filter({ mention: 'exclude' });
    expect(isExcluded(card({ text: '혼잣말' }), f)).toBe(false);
    expect(isExcluded(card({ text: '@someone 안녕' }), f)).toBe(true);
  });
});

describe('isExcluded — 제외 조건', () => {
  it('matches each flag to its own signal', () => {
    expect(isExcluded(card({ liked: true }), filter({ exclude: ['liked'] }))).toBe(true);
    expect(isExcluded(card({ hasLikes: true }), filter({ exclude: ['liked'] }))).toBe(false);
    expect(isExcluded(card({ hasLikes: true }), filter({ exclude: ['hasLikes'] }))).toBe(true);
    expect(isExcluded(card({ retweeted: true }), filter({ exclude: ['retweeted'] }))).toBe(true);
    expect(isExcluded(card({ hasRetweets: true }), filter({ exclude: ['hasRetweets'] }))).toBe(
      true,
    );
    expect(isExcluded(card({ bookmarked: true }), filter({ exclude: ['bookmarked'] }))).toBe(true);
    expect(isExcluded(card({ hasBookmarks: true }), filter({ exclude: ['hasBookmarks'] }))).toBe(
      true,
    );
  });

  it('separates my own media from media inside a quoted post', () => {
    const quoted = card({ hasMedia: true, ownMedia: false });
    const mine = card({ hasMedia: true, ownMedia: true });
    expect(isExcluded(quoted, filter({ exclude: ['ownMedia'] }))).toBe(false);
    expect(isExcluded(quoted, filter({ exclude: ['anyMedia'] }))).toBe(true);
    expect(isExcluded(mine, filter({ exclude: ['ownMedia'] }))).toBe(true);
  });

  it('drops the post when any checked condition hits', () => {
    const f = filter({ exclude: ['liked', 'anyMedia'] });
    expect(isExcluded(card({ hasMedia: true }), f)).toBe(true);
    expect(isExcluded(card({ hasLikes: true }), f)).toBe(false);
  });
});

describe('isExcluded — 키워드', () => {
  it('matches anywhere in the body, ignoring case', () => {
    const f = filter({ keywords: '큐비,CYD' });
    expect(isExcluded(card({ text: '오늘 큐비 썼다' }), f)).toBe(true);
    expect(isExcluded(card({ text: 'cyd 좋네' }), f)).toBe(true);
    expect(isExcluded(card({ text: '아무말' }), f)).toBe(false);
  });
});

describe('isFilterActive', () => {
  it('is false only when nothing is set', () => {
    expect(isFilterActive(NO_SWEEP_FILTER)).toBe(false);
    expect(isFilterActive(filter({ keywords: '  ,  ' }))).toBe(false);
    expect(isFilterActive(filter({ mention: 'only' }))).toBe(true);
    expect(isFilterActive(filter({ exclude: ['liked'] }))).toBe(true);
    expect(isFilterActive(filter({ keywords: '큐비' }))).toBe(true);
  });
});

describe('coerceSweepFilter', () => {
  it('falls back to no filter for missing or damaged values', () => {
    expect(coerceSweepFilter(undefined)).toEqual(NO_SWEEP_FILTER);
    expect(coerceSweepFilter({ mention: 'nope', exclude: 'no', keywords: 7 })).toEqual(
      NO_SWEEP_FILTER,
    );
  });

  it('drops unknown flags, keeps display order, and caps the keyword length', () => {
    expect(coerceSweepFilter({ exclude: ['anyMedia', 'ghost', 'liked'] }).exclude).toEqual([
      'liked',
      'anyMedia',
    ]);
    expect(coerceSweepFilter({ keywords: 'x'.repeat(200) }).keywords).toHaveLength(KEYWORDS_MAX);
  });
});
