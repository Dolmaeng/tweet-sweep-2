// 도메인 모델. 브라우저·확장 API에 의존하지 않는다 (NFR-10).

export type PostKind = 'post' | 'reply' | 'retweet';

export interface Post {
  /** 게시물 id (문자열, 64비트 정수 안전) */
  id: string;
  /** ISO 8601 UTC */
  createdAt: string;
  kind: PostKind;
  text: string;
  /** 답글이면 원글 id */
  inReplyToId: string | null;
  hasMedia: boolean;
  /** photo | video | animated_gif 등, 아카이브의 media type 원본 */
  mediaTypes: string[];
  likeCount: number;
  retweetCount: number;
  /** 아카이브 원본(스냅샷, 헌장 P4). 삭제 후에도 보존 */
  raw: unknown;
}

export interface Account {
  /** 아카이브 account.js의 accountId. 세션 twid와 대조(FR-03) */
  userId: string;
  username: string;
  /** 아카이브 생성 시각 추정(가장 최근 게시물 시각). 없으면 null */
  archiveLatestPostAt: string | null;
  importedAt: string;
}

export interface ArchiveSummary {
  account: Pick<Account, 'userId' | 'username'>;
  total: number;
  byKind: Record<PostKind, number>;
  withMedia: number;
  byYear: Record<string, number>;
  earliestAt: string | null;
  latestAt: string | null;
}

export type JobItemStatus =
  'pending' | 'running' | 'done' | 'gone' | 'blocked' | 'failed' | 'skipped';

export interface Job {
  id: string;
  userId: string;
  filterSpec: unknown;
  preset: PresetName;
  createdAt: string;
  status: 'planned' | 'running' | 'paused' | 'halted' | 'completed';
  targetCount: number;
}

export interface JobItem {
  jobId: string;
  postId: string;
  status: JobItemStatus;
  attempts: number;
  lastSignal: Signal | null;
  doneAt: string | null;
}

export type PresetName = 'cautious' | 'normal' | 'brisk';

/** 실행기·네트워크 관측이 보고하는 신호 (SRS FR-09) */
export type Signal =
  | 'rate_limit'
  | 'auth_redirect'
  | 'account_locked'
  | 'not_found'
  | 'dom_changed'
  | 'timeout'
  | 'unknown_error';

export type ExecutionResult =
  | { kind: 'ok' }
  | { kind: 'gone' }
  | { kind: 'blocked'; signal: Signal; detail?: string }
  | { kind: 'error'; signal: Signal; detail?: string };

export interface AuditEvent {
  ts: string;
  jobId: string;
  postId: string;
  executor: 'ui-click' | 'graphql-replay' | 'dry-run';
  result: ExecutionResult['kind'];
  signal: Signal | null;
  durationMs: number;
  detail?: string;
}

/** 주입 가능한 난수원 [0,1). 테스트에서 결정적으로 만들 수 있다 */
export interface Rng {
  (): number;
}
