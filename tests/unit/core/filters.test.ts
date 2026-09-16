import { describe, expect, it } from 'vitest';
import type { Post, PostKind } from '../../../src/core/models';
import { isValidRegex, selectTargets } from '../../../src/core/filters';

function post(over: Partial<Post> & { id: string }): Post {
  return {
    createdAt: '2020-06-15T00:00:00.000Z',
    kind: 'post',
    text: '',
    inReplyToId: null,
    hasMedia: false,
    mediaTypes: [],
    likeCount: 0,
    retweetCount: 0,
    raw: {},
    ...over,
  };
}

const POSTS: Post[] = [
  post({
    id: '1',
    kind: 'post',
    text: 'hello world',
    createdAt: '2019-01-01T00:00:00.000Z',
    likeCount: 2,
  }),
  post({
    id: '2',
    kind: 'reply',
    text: 'a REPLY here',
    createdAt: '2021-05-05T00:00:00.000Z',
    likeCount: 500,
  }),
  post({ id: '3', kind: 'retweet', text: 'RT @x: hi', createdAt: '2022-01-01T00:00:00.000Z' }),
  post({
    id: '4',
    kind: 'post',
    text: 'pinned tweet',
    createdAt: '2023-01-01T00:00:00.000Z',
    retweetCount: 999,
  }),
];

const ids = (ps: Post[]) => ps.map((p) => p.id);

describe('selectTargets', () => {
  it('targets posts and replies by default, excluding retweets', () => {
    expect(ids(selectTargets(POSTS, {}))).toEqual(['1', '2', '4']);
  });

  it('filters by kind', () => {
    const kinds: PostKind[] = ['reply'];
    expect(ids(selectTargets(POSTS, { kinds }))).toEqual(['2']);
  });

  it('filters by inclusive date range', () => {
    expect(ids(selectTargets(POSTS, { from: '2021-01-01', to: '2023-12-31' }))).toEqual(['2', '4']);
  });

  it('filters by case-insensitive keyword', () => {
    expect(ids(selectTargets(POSTS, { keyword: 'reply' }))).toEqual(['2']);
  });

  it('filters by regex', () => {
    expect(ids(selectTargets(POSTS, { regex: '^hello' }))).toEqual(['1']);
  });

  it('keeps ids in keepIds', () => {
    expect(ids(selectTargets(POSTS, { keepIds: ['4'] }))).toEqual(['1', '2']);
  });

  it('keeps posts above like or retweet thresholds', () => {
    expect(ids(selectTargets(POSTS, { keepMinLikes: 100 }))).toEqual(['1', '4']);
    expect(ids(selectTargets(POSTS, { keepMinRetweets: 100 }))).toEqual(['1', '2']);
  });

  it('combines conditions', () => {
    expect(ids(selectTargets(POSTS, { kinds: ['post'], keepMinRetweets: 100 }))).toEqual(['1']);
  });

  it('an invalid regex matches nothing', () => {
    expect(isValidRegex('(')).toBe(false);
    expect(selectTargets(POSTS, { regex: '(' })).toEqual([]);
  });
});
