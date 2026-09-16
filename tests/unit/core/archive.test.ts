import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ArchiveFormatError,
  classify,
  isAccountFile,
  isTweetsFile,
  mergeParts,
  parseAccountText,
  parseCreatedAt,
  parseTweetsText,
  partIndex,
  stripYtdPrefix,
  summarize,
} from '../../../src/core/archive/parse';

const FIX = join(__dirname, '..', '..', 'fixtures', 'archive');
const read = (name: string) => readFileSync(join(FIX, name), 'utf8');

describe('file name detection', () => {
  it('matches tweets files including parts and legacy singular', () => {
    expect(isTweetsFile('data/tweets.js')).toBe(true);
    expect(isTweetsFile('data/tweets-part1.js')).toBe(true);
    expect(isTweetsFile('data/tweet.js')).toBe(true);
    expect(isTweetsFile('data/tweet-part12.js')).toBe(true);
    expect(isTweetsFile('tweets.js')).toBe(true);
    expect(isTweetsFile('data/like.js')).toBe(false);
    expect(isTweetsFile('data/tweetdeck.js')).toBe(false);
    expect(isTweetsFile('data/direct-messages.js')).toBe(false);
  });
  it('matches only account.js', () => {
    expect(isAccountFile('data/account.js')).toBe(true);
    expect(isAccountFile('data/account-timezone.js')).toBe(false);
  });
  it('orders parts', () => {
    expect(partIndex('data/tweets.js')).toBe(0);
    expect(partIndex('data/tweets-part3.js')).toBe(3);
  });
});

describe('stripYtdPrefix', () => {
  it('removes the window.YTD assignment', () => {
    expect(stripYtdPrefix('window.YTD.tweets.part0 = [ ]')).toBe('[ ]');
    expect(stripYtdPrefix('window.YTD.tweet.part0=[{"a":"x=y"}]')).toBe('[{"a":"x=y"}]');
  });
  it('rejects non-archive text', () => {
    expect(() => stripYtdPrefix('[1,2]')).toThrow(ArchiveFormatError);
    expect(() => stripYtdPrefix('const a = 1')).toThrow(ArchiveFormatError);
  });
});

describe('parseTweetsText', () => {
  const posts = parseTweetsText(read('tweets.js'));

  it('parses every entry in order', () => {
    expect(posts.map((p) => p.id)).toEqual([
      '1000000000000000001',
      '1000000000000000002',
      '1000000000000000003',
      '1000000000000000004',
    ]);
  });
  it('classifies post / reply / retweet', () => {
    expect(posts.map((p) => p.kind)).toEqual(['post', 'reply', 'retweet', 'post']);
    expect(posts[1]?.inReplyToId).toBe('999000000000000000');
  });
  it('detects media from extended_entities and lists types', () => {
    expect(posts[3]?.hasMedia).toBe(true);
    expect(posts[3]?.mediaTypes).toEqual(['photo', 'video']);
    expect(posts[0]?.hasMedia).toBe(false);
  });
  it('converts string counts to numbers', () => {
    expect(posts[0]?.likeCount).toBe(3);
    expect(posts[2]?.retweetCount).toBe(120);
  });
  it('normalizes created_at with timezone offset to UTC ISO', () => {
    expect(posts[0]?.createdAt).toBe('2024-01-15T10:15:00.000Z');
    expect(posts[1]?.createdAt).toBe('2019-03-05T14:59:59.000Z');
  });
  it('keeps the raw object as snapshot', () => {
    expect((posts[0]?.raw as { id_str: string }).id_str).toBe('1000000000000000001');
  });
  it('accepts the legacy window.YTD.tweet prefix', () => {
    const legacy = parseTweetsText(read('tweet-legacy.js'));
    expect(legacy).toHaveLength(1);
    expect(legacy[0]?.createdAt).toBe('2015-01-01T00:00:00.000Z');
  });
  it('throws on broken JSON', () => {
    expect(() => parseTweetsText('window.YTD.tweets.part0 = [ {')).toThrow(ArchiveFormatError);
  });
});

describe('classify', () => {
  it('treats RT prefix as retweet even when it is also a reply', () => {
    expect(classify('RT @a: hi', '1')).toBe('retweet');
    expect(classify('RT@a', null)).toBe('post');
    expect(classify('hello', '1')).toBe('reply');
    expect(classify('hello', null)).toBe('post');
  });
});

describe('parseCreatedAt', () => {
  it('handles negative offsets and missing values', () => {
    expect(parseCreatedAt('Mon Jan 01 00:30:00 -0500 2020')).toBe('2020-01-01T05:30:00.000Z');
    expect(parseCreatedAt(null)).toBe('1970-01-01T00:00:00.000Z');
    expect(parseCreatedAt('garbage')).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('mergeParts', () => {
  it('merges by part order and drops duplicate ids', () => {
    const p0 = parseTweetsText(read('tweets.js'));
    const p1 = parseTweetsText(read('tweets-part1.js'));
    const merged = mergeParts([
      { name: 'data/tweets-part1.js', posts: p1 },
      { name: 'data/tweets.js', posts: p0 },
    ]);
    expect(merged.map((p) => p.id)).toEqual([
      '1000000000000000001',
      '1000000000000000002',
      '1000000000000000003',
      '1000000000000000004',
      '1000000000000000005',
    ]);
    // part0 wins over part1 for the duplicate
    expect(merged[3]?.text).toBe('photo https://t.co/abc');
  });
});

describe('parseAccountText', () => {
  it('returns only accountId and username', () => {
    const account = parseAccountText(read('account.js'));
    expect(account).toEqual({ userId: '123456789', username: 'fixture_user' });
    expect(JSON.stringify(account)).not.toContain('example.com');
  });
  it('throws when fields are missing', () => {
    expect(() => parseAccountText('window.YTD.account.part0 = [ { "account": {} } ]')).toThrow(
      ArchiveFormatError,
    );
  });
});

describe('summarize', () => {
  it('aggregates kinds, media, years, range', () => {
    const posts = parseTweetsText(read('tweets.js'));
    const s = summarize(posts, { userId: '1', username: 'u' });
    expect(s.total).toBe(4);
    expect(s.byKind).toEqual({ post: 2, reply: 1, retweet: 1 });
    expect(s.withMedia).toBe(1);
    expect(s.byYear).toEqual({ '2013': 1, '2018': 1, '2019': 1, '2024': 1 });
    expect(s.earliestAt).toBe('2013-07-20T08:00:00.000Z');
    expect(s.latestAt).toBe('2024-01-15T10:15:00.000Z');
  });
});

describe('performance', () => {
  it('parses 30,000 synthetic posts in under 10 s (NFR-03)', () => {
    const entries = Array.from({ length: 30_000 }, (_, i) => ({
      tweet: {
        id_str: String(1_500_000_000_000_000_000n + BigInt(i)),
        created_at: 'Wed Oct 10 20:19:24 +0000 2018',
        full_text: i % 7 === 0 ? 'RT @x: repost' : `post number ${i} with some text`,
        in_reply_to_status_id_str: i % 3 === 0 ? '1' : undefined,
        favorite_count: String(i % 50),
        retweet_count: '0',
        entities: { hashtags: [], urls: [] },
      },
    }));
    const text = `window.YTD.tweets.part0 = ${JSON.stringify(entries)}`;
    const t0 = performance.now();
    const posts = parseTweetsText(text);
    const elapsed = performance.now() - t0;
    expect(posts).toHaveLength(30_000);
    expect(elapsed).toBeLessThan(10_000);
  });
});
