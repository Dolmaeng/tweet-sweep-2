// 스윕 보존 필터 (FR-18a, ADR-0010). 순수 함수, 타임라인 카드에서 읽은 값만 본다.
// 새 조건은 ExcludeFlag와 EXCLUDE_TESTS에 한 줄씩 더하면 된다(FR-04와 같은 규칙).
import type { TimelineItem } from './timeline';

/** 멘션(남에게 말을 건 글)을 어떻게 취급할지 */
export type MentionMode = 'all' | 'only' | 'exclude';

/** 체크하면 그 조건에 걸리는 글을 지우지 않는다 */
export type ExcludeFlag =
  | 'liked'
  | 'hasLikes'
  | 'retweeted'
  | 'hasRetweets'
  | 'bookmarked'
  | 'hasBookmarks'
  | 'ownMedia'
  | 'anyMedia';

export interface SweepFilter {
  mention: MentionMode;
  /** 다중 선택 */
  exclude: ExcludeFlag[];
  /** 쉼표로 구분한 제외 키워드 원문 */
  keywords: string;
}

export const KEYWORDS_MAX = 100;

export const NO_SWEEP_FILTER: SweepFilter = { mention: 'all', exclude: [], keywords: '' };

export const MENTION_MODES: MentionMode[] = ['all', 'only', 'exclude'];

export const MENTION_LABELS: Record<MentionMode, string> = {
  all: '모든 트윗 포함',
  only: '멘션만 포함 (@로 시작하는 트윗)',
  exclude: '멘션 제외 (@로 시작하는 트윗 제외)',
};

/** 화면 표시 순서 */
export const EXCLUDE_FLAGS: ExcludeFlag[] = [
  'liked',
  'hasLikes',
  'retweeted',
  'hasRetweets',
  'bookmarked',
  'hasBookmarks',
  'ownMedia',
  'anyMedia',
];

export const EXCLUDE_LABELS: Record<ExcludeFlag, string> = {
  liked: '내가 좋아요한 트윗 제외',
  hasLikes: '좋아요가 1개 이상인 트윗 제외',
  retweeted: '내가 리트윗한 트윗 제외',
  hasRetweets: '리트윗이 1개 이상인 트윗 제외',
  bookmarked: '내가 북마크한 트윗 제외',
  hasBookmarks: '북마크가 1개 이상인 트윗 제외',
  ownMedia: '내가 올린 미디어가 있는 트윗 제외',
  anyMedia: '미디어가 있는 모든 트윗 제외 (리트윗 포함)',
};

const EXCLUDE_TESTS: Record<ExcludeFlag, (item: TimelineItem) => boolean> = {
  liked: (i) => i.liked,
  hasLikes: (i) => i.hasLikes,
  retweeted: (i) => i.retweeted,
  hasRetweets: (i) => i.hasRetweets,
  bookmarked: (i) => i.bookmarked,
  hasBookmarks: (i) => i.hasBookmarks,
  ownMedia: (i) => i.ownMedia,
  anyMedia: (i) => i.hasMedia,
};

/** 쉼표로 나눈 키워드. 비교는 소문자로 한다(명세: 대소문자 구분 없음) */
export function keywordList(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

/**
 * 남에게 말을 건 글. 답글 카드이거나 본문이 @로 시작한다.
 * X는 답글 카드에서 맨 앞 @핸들을 본문에 넣지 않고 따로 표시하므로 둘 다 봐야 한다.
 */
export function isMention(item: TimelineItem): boolean {
  return item.reply || item.text.trimStart().startsWith('@');
}

/** true면 삭제 대상에서 뺀다 */
export function isExcluded(item: TimelineItem, filter: SweepFilter): boolean {
  if (filter.mention === 'only' && !isMention(item)) return true;
  if (filter.mention === 'exclude' && isMention(item)) return true;
  if (filter.exclude.some((flag) => EXCLUDE_TESTS[flag](item))) return true;
  const text = item.text.toLowerCase();
  return keywordList(filter.keywords).some((k) => text.includes(k));
}

export function isFilterActive(filter: SweepFilter): boolean {
  return (
    filter.mention !== 'all' || filter.exclude.length > 0 || keywordList(filter.keywords).length > 0
  );
}

/** 저장값이 손상됐거나 구버전이면 필터 없음으로 보정한다 */
export function coerceSweepFilter(raw: unknown): SweepFilter {
  const r = (raw ?? {}) as Partial<SweepFilter>;
  const stored: unknown[] = Array.isArray(r.exclude) ? r.exclude : [];
  return {
    mention: MENTION_MODES.includes(r.mention as MentionMode) ? (r.mention as MentionMode) : 'all',
    // EXCLUDE_FLAGS로 걸러 모르는 값은 버리고 표시 순서를 유지한다
    exclude: EXCLUDE_FLAGS.filter((f) => stored.includes(f)),
    keywords: typeof r.keywords === 'string' ? r.keywords.slice(0, KEYWORDS_MAX) : '',
  };
}
