import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Job } from '../../../src/core/models';
import {
  appendAudit,
  createJob,
  getResumableJob,
  itemStatusOf,
  listAudit,
  markItem,
  nextPending,
  pendingCount,
  requeueFailed,
  resetDb,
  setJobStatus,
} from '../../../src/platform/db';

function job(id: string, targetCount: number): Job {
  return {
    id,
    userId: 'u1',
    filterSpec: {},
    preset: 'brisk',
    createdAt: '2026-09-17T00:00:00.000Z',
    status: 'planned',
    targetCount,
    removedCount: 0,
  };
}

describe('job persistence', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a job with pending items and counts them', async () => {
    await createJob(job('j1', 3), ['10', '11', '12']);
    expect(await pendingCount('j1')).toBe(3);
    expect(await getResumableJob('u1')).toMatchObject({ id: 'j1', status: 'planned' });
  });

  it('marks items and advances removedCount only for removals', async () => {
    await createJob(job('j1', 3), ['10', '11', '12']);

    expect(await nextPending('j1')).toBe('12'); // 기본은 최신부터
    const after1 = await markItem('j1', '10', 'done', null, true);
    expect(after1).toBe(1);

    await markItem('j1', '11', 'gone', 'not_found', true);
    await markItem('j1', '12', 'failed', 'dom_changed', false);

    expect(await pendingCount('j1')).toBe(0);
    const resumable = await getResumableJob('u1');
    expect(resumable?.removedCount).toBe(2); // done + gone, not the failure
  });

  it('deletes newest first by default and oldest first when asked', async () => {
    // 18자리(옛 글)와 19자리가 섞인 실제 상황: 문자열 순이면 '934…'가 최신으로 오인된다
    await createJob(job('j6', 3), [
      '934000000000000000',
      '1734000000000000000',
      '795000000000000000',
    ]);
    expect(await nextPending('j6', 'newest')).toBe('1734000000000000000');
    expect(await nextPending('j6', 'oldest')).toBe('795000000000000000');
  });

  it('resume picks pending items after a restart, without duplicates', async () => {
    await createJob(job('j1', 2), ['10', '11']);
    await markItem('j1', '10', 'done', null, true);
    // 재시작: 다음 pending은 11 하나뿐
    expect(await nextPending('j1')).toBe('11');
    expect(await pendingCount('j1')).toBe(1);
  });

  it('requeues failed and blocked items on resume until attempts run out', async () => {
    await createJob(job('j5', 3), ['50', '51', '52']);
    await markItem('j5', '50', 'failed', 'dom_changed', false);
    await markItem('j5', '51', 'blocked', 'auth_redirect', false);
    await markItem('j5', '52', 'done', null, true);
    expect(await pendingCount('j5')).toBe(0);
    expect(await requeueFailed('j5')).toBe(2);
    expect(await pendingCount('j5')).toBe(2);

    for (let i = 0; i < 2; i++) await markItem('j5', '50', 'failed', 'dom_changed', false);
    // attempts=3 → 더 이상 재큐 안 됨. '51'은 attempts=1이라 재큐
    await markItem('j5', '51', 'failed', 'dom_changed', false);
    expect(await requeueFailed('j5')).toBe(1);
    expect(await nextPending('j5')).toBe('51');
  });

  it('completed jobs are not resumable', async () => {
    await createJob(job('j1', 1), ['10']);
    await setJobStatus('j1', 'completed');
    expect(await getResumableJob('u1')).toBeUndefined();
  });

  it('records audit rows per job', async () => {
    await appendAudit({
      ts: 't',
      jobId: 'j1',
      postId: '10',
      executor: 'ui-click',
      result: 'ok',
      signal: null,
      durationMs: 1200,
    });
    expect(await listAudit('j1')).toHaveLength(1);
  });

  it('maps execution results to item statuses', () => {
    expect(itemStatusOf({ kind: 'ok' })).toBe('done');
    expect(itemStatusOf({ kind: 'gone' })).toBe('gone');
    expect(itemStatusOf({ kind: 'blocked', signal: 'rate_limit' })).toBe('blocked');
    expect(itemStatusOf({ kind: 'error', signal: 'timeout' })).toBe('failed');
  });
});
