// IndexedDB 저장소 (plan §2). 계정(userId) 기준으로 모든 상태를 분리한다 (FR-13).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Account,
  ArchiveSummary,
  AuditEvent,
  ExecutionResult,
  Job,
  JobItem,
  JobItemStatus,
  Post,
  PostKind,
  Signal,
} from '../core/models';

export const DB_NAME = 'tweet-sweep-2';
export const DB_VERSION = 1;
const CHUNK = 1000;

export interface AccountRecord extends Account {
  summary: ArchiveSummary | null;
}

export interface PostRecord extends Post {
  userId: string;
}

export interface BudgetRecord {
  userId: string;
  day: string;
  count: number;
  blockedCount: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

interface Schema extends DBSchema {
  accounts: { key: string; value: AccountRecord };
  posts: {
    key: [string, string];
    value: PostRecord;
    indexes: { byUser: string; byUserKind: [string, PostKind]; byUserCreated: [string, string] };
  };
  jobs: { key: string; value: Job; indexes: { byUser: string } };
  jobItems: {
    key: [string, string];
    value: JobItem;
    indexes: { byJobStatus: [string, string] };
  };
  audit: { key: number; value: AuditEvent; indexes: { byJob: string } };
  budget: { key: [string, string]; value: BudgetRecord };
  settings: { key: string; value: SettingRecord };
}

export type Db = IDBPDatabase<Schema>;

let cached: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  cached ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('accounts', { keyPath: 'userId' });
      const posts = db.createObjectStore('posts', { keyPath: ['userId', 'id'] });
      posts.createIndex('byUser', 'userId');
      posts.createIndex('byUserKind', ['userId', 'kind']);
      posts.createIndex('byUserCreated', ['userId', 'createdAt']);
      const jobs = db.createObjectStore('jobs', { keyPath: 'id' });
      jobs.createIndex('byUser', 'userId');
      const items = db.createObjectStore('jobItems', { keyPath: ['jobId', 'postId'] });
      items.createIndex('byJobStatus', ['jobId', 'status']);
      const audit = db.createObjectStore('audit', { autoIncrement: true });
      audit.createIndex('byJob', 'jobId');
      db.createObjectStore('budget', { keyPath: ['userId', 'day'] });
      db.createObjectStore('settings', { keyPath: 'key' });
    },
  });
  return cached;
}

/** 테스트·재설정용. 캐시를 비우고 DB를 삭제한다 */
export async function resetDb(): Promise<void> {
  if (cached) (await cached).close();
  cached = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/** 1,000건 단위 트랜잭션으로 저장. 같은 (userId,id)는 덮어써 재가져오기에 멱등 */
export async function putPosts(
  userId: string,
  posts: Post[],
  onProgress?: (done: number) => void,
): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < posts.length; i += CHUNK) {
    const tx = db.transaction('posts', 'readwrite');
    const slice = posts.slice(i, i + CHUNK);
    await Promise.all([...slice.map((p) => tx.store.put({ ...p, userId })), tx.done]);
    onProgress?.(Math.min(i + CHUNK, posts.length));
  }
}

export async function putAccount(record: AccountRecord): Promise<void> {
  const db = await getDb();
  await db.put('accounts', record);
}

export async function getAccount(userId: string): Promise<AccountRecord | undefined> {
  const db = await getDb();
  return db.get('accounts', userId);
}

export async function listAccounts(): Promise<AccountRecord[]> {
  const db = await getDb();
  return db.getAll('accounts');
}

export async function countPosts(userId: string): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('posts', 'byUser', userId);
}

export async function listPosts(userId: string): Promise<PostRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex('posts', 'byUser', userId);
}

export async function deleteAccountData(userId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['accounts', 'posts'], 'readwrite');
  await tx.objectStore('accounts').delete(userId);
  let cursor = await tx.objectStore('posts').index('byUser').openKeyCursor(userId);
  while (cursor) {
    await tx.objectStore('posts').delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ── 작업(run) 저장·진행 (plan §2, FR-11a) ──

/** 작업과 대상 항목(pending)을 한 트랜잭션에 생성 */
export async function createJob(job: Job, targetIds: string[]): Promise<void> {
  const db = await getDb();
  const CH = 2000;
  {
    const tx = db.transaction('jobs', 'readwrite');
    await Promise.all([tx.store.put(job), tx.done]);
  }
  for (let i = 0; i < targetIds.length; i += CH) {
    const tx = db.transaction('jobItems', 'readwrite');
    const slice = targetIds.slice(i, i + CH);
    await Promise.all([
      ...slice.map((postId) =>
        tx.store.put({
          jobId: job.id,
          postId,
          status: 'pending',
          attempts: 0,
          lastSignal: null,
          doneAt: null,
        }),
      ),
      tx.done,
    ]);
  }
}

/** 재개 가능한 작업(계획/진행/일시정지) */
export async function getResumableJob(userId: string): Promise<Job | undefined> {
  const db = await getDb();
  const jobs = await db.getAllFromIndex('jobs', 'byUser', userId);
  return jobs
    .filter((j) => j.status === 'planned' || j.status === 'running' || j.status === 'paused')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function getJob(jobId: string): Promise<Job | undefined> {
  const db = await getDb();
  return db.get('jobs', jobId);
}

export async function setJobStatus(jobId: string, status: Job['status']): Promise<void> {
  const db = await getDb();
  const job = await db.get('jobs', jobId);
  if (job) await db.put('jobs', { ...job, status });
}

export async function pendingCount(jobId: string): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('jobItems', 'byJobStatus', [jobId, 'pending']);
}

/** 다음 pending 항목의 postId(없으면 null). 상태는 바꾸지 않는다 */
export async function nextPending(jobId: string): Promise<string | null> {
  const db = await getDb();
  const item = await db.getFromIndex('jobItems', 'byJobStatus', [jobId, 'pending']);
  return item?.postId ?? null;
}

/** 항목 결과 반영. removed면 job.removedCount 증가. 한 트랜잭션 */
export async function markItem(
  jobId: string,
  postId: string,
  status: JobItemStatus,
  signal: Signal | null,
  removed: boolean,
): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(['jobItems', 'jobs'], 'readwrite');
  const items = tx.objectStore('jobItems');
  const jobs = tx.objectStore('jobs');
  const item = (await items.get([jobId, postId])) as JobItem | undefined;
  if (item) {
    const updated: JobItem = {
      ...item,
      status,
      lastSignal: signal,
      attempts: item.attempts + 1,
      doneAt: new Date().toISOString(),
    };
    await items.put(updated);
  }
  const job = (await jobs.get(jobId)) as Job | undefined;
  let removedCount = job?.removedCount ?? 0;
  if (job && removed) {
    removedCount += 1;
    await jobs.put({ ...job, removedCount });
  }
  await tx.done;
  return removedCount;
}

/**
 * 재개 시 실패·차단 항목을 다시 pending으로. attempts가 maxAttempts 이상이면 그대로 둔다.
 * (일시 오류·셀렉터 수정 후 재시도 경로. 없으면 failed는 영영 건너뜀)
 */
export async function requeueFailed(jobId: string, maxAttempts = 3): Promise<number> {
  const db = await getDb();
  const tx = db.transaction('jobItems', 'readwrite');
  let requeued = 0;
  for (const status of ['failed', 'blocked'] as const) {
    const rows = (await tx.store.index('byJobStatus').getAll([jobId, status])) as JobItem[];
    for (const item of rows) {
      if (item.attempts >= maxAttempts) continue;
      await tx.store.put({ ...item, status: 'pending', doneAt: null });
      requeued += 1;
    }
  }
  await tx.done;
  return requeued;
}

export async function appendAudit(ev: AuditEvent): Promise<void> {
  const db = await getDb();
  await db.add('audit', ev);
}

export async function listAudit(jobId: string): Promise<AuditEvent[]> {
  const db = await getDb();
  return db.getAllFromIndex('audit', 'byJob', jobId);
}

/** 결과 → 항목 상태 */
export function itemStatusOf(result: ExecutionResult): JobItemStatus {
  switch (result.kind) {
    case 'ok':
      return 'done';
    case 'gone':
      return 'gone';
    case 'blocked':
      return 'blocked';
    case 'error':
      return 'failed';
  }
}
