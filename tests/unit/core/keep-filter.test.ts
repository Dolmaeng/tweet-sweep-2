import { describe, expect, it } from 'vitest';
import type { Post, PostKind } from '../../../src/core/models';
import type { TimelineItem } from '../../../src/core/timeline';
import {
  CAPABLE_FIELDS,
  CAPABLE_FLAGS,
  KEEP_FLAGS,
  NO_KEEP_FILTER,
  coerceKeepFilter,
  fieldReason,
  flagReason,
  isFilterActive,
  isKeptSweep,
  isValidRegex,
  keepReasons,
  selectTargets,
  type KeepFilter,
} from '../../../src/core/keep-filter';

function f(over: Partial<KeepFilter> = {}): KeepFilter {
  return { ...NO_KEEP_FILTER, ...over };
}

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

function item(over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    postId: '1',
    handle: 'me',
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
    ...over,
  };
}

const POSTS: Post[] = [
  post({ id: '1', text: 'hello world', createdAt: '2019-01-01T00:00:00.000Z', likeCount: 2 }),
  post({
    id: '2',
    kind: 'reply',
    text: 'a REPLY here',
    createdAt: '2021-05-05T00:00:00.000Z',
    inReplyToId: '900',
    likeCount: 500,
  }),
  post({ id: '3', kind: 'retweet', text: 'RT @x: hi', createdAt: '2022-01-01T00:00:00.000Z' }),
  post({
    id: '4',
    text: 'pinned tweet',
    createdAt: '2023-01-01T00:00:00.000Z',
    retweetCount: 999,
  }),
  post({ id: '5', text: 'photo day', hasMedia: true, mediaTypes: ['photo'] }),
];

const ids = (ps: Post[]) => ps.map((p) => p.id);

describe('아카이브 판정', () => {
  it('기본은 원글+답글, 리포스트는 건드리지 않는다', () => {
    expect(ids(selectTargets(POSTS, f()))).toEqual(['1', '2', '4', '5']);
  });

  it('종류를 둘 다 끄면 대상 0이다 (기본값으로 되돌리지 않는다)', () => {
    const kinds: PostKind[] = [];
    expect(selectTargets(POSTS, f({ kinds }))).toEqual([]);
  });

  it('기간은 양끝을 포함한다', () => {
    expect(ids(selectTargets(POSTS, f({ from: '2021-01-01', to: '2023-12-31' })))).toEqual([
      '2',
      '4',
    ]);
  });

  it('잘못된 날짜는 조건 없음으로 본다', () => {
    expect(ids(selectTargets(POSTS, f({ from: 'nope' })))).toEqual(['1', '2', '4', '5']);
  });

  it('미디어가 있는 글을 남긴다 — 예전 아카이브 경로에 없던 조건', () => {
    expect(ids(selectTargets(POSTS, f({ keep: ['anyMedia'] })))).toEqual(['1', '2', '4']);
  });

  it('임계값은 그 수 이상이면 남긴다. 빈 값·0은 조건 없음', () => {
    expect(ids(selectTargets(POSTS, f({ keepMinLikes: '100' })))).toEqual(['1', '4', '5']);
    expect(ids(selectTargets(POSTS, f({ keepMinRetweets: '100' })))).toEqual(['1', '2', '5']);
    expect(ids(selectTargets(POSTS, f({ keepMinLikes: '0' })))).toEqual(['1', '2', '4', '5']);
    expect(ids(selectTargets(POSTS, f({ keepMinLikes: '  ' })))).toEqual(['1', '2', '4', '5']);
  });

  it('지정한 id와 제외 키워드는 남긴다', () => {
    expect(ids(selectTargets(POSTS, f({ keepIds: '4, 5' })))).toEqual(['1', '2']);
    expect(ids(selectTargets(POSTS, f({ excludeKeywords: 'HELLO' })))).toEqual(['2', '4', '5']);
  });

  it('멘션 구분은 답글 카드와 @로 시작하는 본문을 함께 본다', () => {
    const at = post({ id: '6', text: '@you hi' });
    const all = [...POSTS, at];
    expect(ids(selectTargets(all, f({ mention: 'only' })))).toEqual(['2', '6']);
    expect(ids(selectTargets(all, f({ mention: 'exclude' })))).toEqual(['1', '4', '5']);
  });

  it('포함 키워드·정규식은 대상을 좁힌다. 잘못된 정규식은 0건', () => {
    expect(ids(selectTargets(POSTS, f({ includeKeyword: 'reply' })))).toEqual(['2']);
    expect(ids(selectTargets(POSTS, f({ includeRegex: '^hello' })))).toEqual(['1']);
    expect(isValidRegex('(')).toBe(false);
    expect(selectTargets(POSTS, f({ includeRegex: '(' }))).toEqual([]);
  });
});

describe('스윕 판정', () => {
  it('플래그에 걸리면 남긴다', () => {
    expect(isKeptSweep(item({ liked: true }), f({ keep: ['liked'] }))).toBe(true);
    expect(isKeptSweep(item({ hasMedia: true }), f({ keep: ['anyMedia'] }))).toBe(true);
    expect(isKeptSweep(item({ hasMedia: true }), f({ keep: ['ownMedia'] }))).toBe(false);
    expect(isKeptSweep(item({ ownMedia: true, hasMedia: true }), f({ keep: ['ownMedia'] }))).toBe(
      true,
    );
  });

  it('멘션과 키워드는 두 모드가 같은 규칙을 쓴다', () => {
    expect(isKeptSweep(item({ reply: true }), f({ mention: 'exclude' }))).toBe(true);
    expect(isKeptSweep(item({ text: '@you hi' }), f({ mention: 'exclude' }))).toBe(true);
    expect(isKeptSweep(item({ text: '큐비 사진' }), f({ excludeKeywords: '큐비' }))).toBe(true);
  });

  it('아카이브 전용 필드는 스윕 판정에 끼어들지 않는다', () => {
    const archiveOnly = f({ keepMinLikes: '1', keepIds: '1', from: '2030-01-01' });
    expect(isKeptSweep(item({ hasLikes: true }), archiveOnly)).toBe(false);
  });
});

describe('능력 매트릭스', () => {
  it('모드가 못 쓰는 조건에는 이유가 붙는다', () => {
    expect(flagReason('sweep', 'liked')).toBeNull();
    expect(flagReason('archive', 'liked')).toContain('like.js');
    expect(fieldReason('archive', 'dateRange')).toBeNull();
    expect(fieldReason('sweep', 'dateRange')).toContain('기간');
  });

  it('모든 플래그·필드가 표에 있거나 이유를 가진다 — 조용히 무시되는 항목이 없다', () => {
    for (const flag of KEEP_FLAGS) {
      for (const mode of ['archive', 'sweep'] as const) {
        const capable = CAPABLE_FLAGS[mode].includes(flag);
        expect(capable ? flagReason(mode, flag) : (flagReason(mode, flag)?.length ?? 0) > 0).toBe(
          capable ? null : true,
        );
      }
    }
    expect(CAPABLE_FIELDS.sweep).toEqual([]);
  });

  it('쓸 수 없는 조건은 활성 판정에도 들어가지 않는다', () => {
    const onlyArchive = f({ keepMinLikes: '10' });
    expect(isFilterActive(onlyArchive, 'archive')).toBe(true);
    expect(isFilterActive(onlyArchive, 'sweep')).toBe(false);
    expect(isFilterActive(f(), 'archive')).toBe(false);
  });

  it('되읽기 문장은 실제로 적용되는 조건만 말한다', () => {
    const mixed = f({ keep: ['anyMedia', 'liked'], keepMinLikes: '10' });
    expect(keepReasons(mixed, 'sweep')).toEqual([
      '미디어가 있는 글 (사진·영상·GIF, 인용한 글 포함)',
      '내가 좋아요한 글',
    ]);
    expect(keepReasons(mixed, 'archive')).toEqual([
      '미디어가 있는 글 (사진·영상·GIF, 인용한 글 포함)',
      '좋아요 10개 이상',
    ]);
  });
});

describe('저장값 보정', () => {
  it('구버전 스윕 필터를 옮긴다', () => {
    const legacy = { mention: 'exclude', exclude: ['ownMedia', 'liked'], keywords: '큐비,트청' };
    const got = coerceKeepFilter(legacy);
    expect(got.mention).toBe('exclude');
    expect(got.keep).toEqual(['ownMedia', 'liked']);
    expect(got.excludeKeywords).toBe('큐비,트청');
  });

  it('모르는 값은 버리고 표시 순서를 지킨다', () => {
    expect(coerceKeepFilter({ keep: ['liked', 'nope', 'anyMedia'] }).keep).toEqual([
      'anyMedia',
      'liked',
    ]);
    expect(coerceKeepFilter(undefined)).toEqual(NO_KEEP_FILTER);
    expect(coerceKeepFilter({ mention: 'weird' }).mention).toBe('all');
  });

  it('kinds가 배열이면 비어 있어도 존중한다', () => {
    expect(coerceKeepFilter({ kinds: [] }).kinds).toEqual([]);
    expect(coerceKeepFilter({}).kinds).toEqual(['post', 'reply']);
  });
});
