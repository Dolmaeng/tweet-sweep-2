// IndexedDB 저장소 (plan §2). 계정(userId) 기준으로 모든 상태를 분리한다 (FR-13).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Account,
  ArchiveSummary,
  AuditEvent,
  Job,
  JobItem,
  Post,
  PostKind,
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
