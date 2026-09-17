// 스윕 모드 후보 선택 (FR-18, ADR-0009). 순수 함수, 브라우저 API 무의존.
import { compareIds } from './order';

/** 타임라인 카드 1장에서 읽어낸 정보 */
export interface TimelineItem {
  postId: string;
  /** permalink의 작성자 handle(@ 없음). 리포스트면 원작성자 handle이 들어온다 */
  handle: string;
  /** 고정된 글(socialContext "고정됨") */
  pinned: boolean;
  /** 남의 글을 재게시한 카드 */
  repost: boolean;
  /** 감사 로그용. 없으면 빈 문자열 */
  text: string;
  /** time[datetime] 값(ISO). 없으면 null */
  createdAt: string | null;
}

/** handle 비교는 대소문자를 무시한다(X는 표시만 다르게 할 수 있음) */
export function sameHandle(a: string, b: string): boolean {
  return a.replace(/^@/, '').toLowerCase() === b.replace(/^@/, '').toLowerCase();
}

/** 내가 쓴 글이고 리포스트가 아니며 이미 시도해 실패한 적 없는 카드 */
export function isSweepCandidate(
  item: TimelineItem,
  username: string,
  skip: ReadonlySet<string>,
): boolean {
  if (item.repost) return false;
  if (!sameHandle(item.handle, username)) return false;
  if (skip.has(item.postId)) return false;
  return true;
}

/**
 * 다음에 지울 카드. 고정글은 **다른 후보가 하나도 없을 때만** 고른다.
 * 고정글은 항상 맨 위에 머물러, 먼저 집으면 나머지를 영원히 못 만난다.
 * 같은 순위 안에서는 최신(ID가 큰 것)을 먼저 — 타임라인 순서와 무관하게 결정적으로.
 */
export function pickSweepTarget(
  items: readonly TimelineItem[],
  username: string,
  skip: ReadonlySet<string> = new Set(),
): TimelineItem | null {
  const candidates = items.filter((i) => isSweepCandidate(i, username, skip));
  if (candidates.length === 0) return null;
  const normal = candidates.filter((i) => !i.pinned);
  const pool = normal.length > 0 ? normal : candidates;
  return pool.reduce((best, i) => (compareIds(i.postId, best.postId) > 0 ? i : best));
}

/** 후보가 없을 때 다음에 할 일. 단계적으로 강하게 시도한다 */
export type SweepRecovery = 'scroll' | 'reload' | 'done';

/**
 * 후보를 못 찾은 연속 횟수로 복구 단계를 정한다.
 * 스크롤 3회 → 새로고침 1회 → 다시 스크롤 3회 → 그래도 없으면 완료.
 */
export function nextRecovery(emptyStreak: number): SweepRecovery {
  if (emptyStreak < 3) return 'scroll';
  if (emptyStreak === 3) return 'reload';
  if (emptyStreak < 7) return 'scroll';
  return 'done';
}
