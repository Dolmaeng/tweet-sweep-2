import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Post } from '../../../src/core/models';
import {
  countPosts,
  deleteAccountData,
  getAccount,
  listAccounts,
  listPosts,
  putAccount,
  putPosts,
  resetDb,
} from '../../../src/platform/db';

function post(i: number, kind: Post['kind'] = 'post'): Post {
  return {
    id: String(1_000_000 + i),
    createdAt: `2020-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    kind,
    text: `post ${i}`,
    inReplyToId: null,
    hasMedia: false,
    mediaTypes: [],
    likeCount: 0,
    retweetCount: 0,
    raw: { id_str: String(1_000_000 + i) },
  };
}

describe('db', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('stores posts per user and re-import is idempotent', async () => {
    const posts = Array.from({ length: 2500 }, (_, i) => post(i));
    const progress: number[] = [];
    await putPosts('u1', posts, (n) => progress.push(n));
    expect(progress).toEqual([1000, 2000, 2500]);
    expect(await countPosts('u1')).toBe(2500);

    await putPosts('u1', posts.slice(0, 10));
    expect(await countPosts('u1')).toBe(2500);

    await putPosts('u2', posts.slice(0, 3));
    expect(await countPosts('u2')).toBe(3);
    expect(await countPosts('u1')).toBe(2500);
  });

  it('keeps account records with summary', async () => {
    await putAccount({
      userId: 'u1',
      username: 'alice',
      archiveLatestPostAt: null,
      importedAt: '2026-09-17T00:00:00.000Z',
      summary: null,
    });
    expect((await getAccount('u1'))?.username).toBe('alice');
    expect(await listAccounts()).toHaveLength(1);
  });

  it('lists and deletes a user without touching others', async () => {
    await putPosts('u1', [post(1), post(2)]);
    await putPosts('u2', [post(3)]);
    await putAccount({
      userId: 'u1',
      username: 'a',
      archiveLatestPostAt: null,
      importedAt: 'x',
      summary: null,
    });
    expect((await listPosts('u1')).map((p) => p.id).sort()).toEqual(['1000001', '1000002']);
    await deleteAccountData('u1');
    expect(await countPosts('u1')).toBe(0);
    expect(await getAccount('u1')).toBeUndefined();
    expect(await countPosts('u2')).toBe(1);
  });
});
