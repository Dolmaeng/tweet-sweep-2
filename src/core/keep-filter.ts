// 보존 필터 (FR-04 + FR-18a 통합, ADR-0012). 아카이브 모드와 스윕 모드가 같은 값을 읽는다.
//
// 설계 요지(docs/spec/04-screens.md):
//  - 화면이 섞어 쓰던 "포함"과 "보존" 두 방향을 섹션으로 갈랐다. §대상 범위는 포함, §보존은 제외.
//  - 모드가 판정할 수 없는 조건은 숨기지 않고 잠근다. UI 잠금과 판정 로직이 같은 표(CAPABLE_*)를
//    보므로, 화면에 보이는데 무시되거나 안 보이는데 적용되는 경우가 생길 수 없다.
//  - 새 조건은 KeepFlag + KEEP_TESTS_* + CAPABLE_FLAGS에 한 줄씩 더하면 된다.
import type { Post, PostKind } from './models';
import type { TimelineItem } from './timeline';
import type { SweepTab } from './xurl';

export type Mode = 'archive' | 'sweep';

/** 판정에 필요한 필드만. 아카이브 원본(raw)까지 들고 다닐 이유가 없다 */
export type TargetPost = Pick<
  Post,
  'id' | 'kind' | 'createdAt' | 'text' | 'inReplyToId' | 'hasMedia' | 'likeCount' | 'retweetCount'
>;

/** 멘션(남에게 말을 건 글)을 어떻게 취급할지 */
export type MentionMode = 'all' | 'only' | 'exclude';

/** 체크하면 그 조건에 걸리는 글을 지우지 않는다 */
export type KeepFlag =
  | 'anyMedia'
  | 'ownMedia'
  | 'liked'
  | 'hasLikes'
  | 'retweeted'
  | 'hasRetweets'
  | 'bookmarked'
  | 'hasBookmarks';

/** 체크박스가 아닌 입력 칸. 모드별 사용 가능 여부를 함께 관리한다 */
export type KeepField =
  | 'kinds'
  | 'dateRange'
  | 'includeKeyword'
  | 'includeRegex'
  | 'keepMinLikes'
  | 'keepMinRetweets'
  | 'keepIds';

/**
 * 입력 원문을 그대로 들고 있는다(숫자·날짜·id 목록도 문자열).
 * 저장값이자 폼 상태라서, 파싱은 판정 직전에 한 번만 한다.
 */
export interface KeepFilter {
  // §1 대상 범위 — "무엇을 지울까" (포함 방향)
  mention: MentionMode;
  kinds: PostKind[];
  /** 'YYYY-MM-DD'. 빈 문자열이면 제한 없음 */
  from: string;
  to: string;
  includeKeyword: string;
  includeRegex: string;
  // §2 보존 — "지우지 않을 글" (제외 방향)
  keep: KeepFlag[];
  keepMinLikes: string;
  keepMinRetweets: string;
  /** 쉼표·공백으로 구분한 글 id */
  keepIds: string;
  /** 쉼표로 구분한 제외 키워드 */
  excludeKeywords: string;
}

export const KEYWORDS_MAX = 100;

export const DEFAULT_KINDS: PostKind[] = ['post', 'reply'];

export const NO_KEEP_FILTER: KeepFilter = {
  mention: 'all',
  kinds: DEFAULT_KINDS,
  from: '',
  to: '',
  includeKeyword: '',
  includeRegex: '',
  keep: [],
  keepMinLikes: '',
  keepMinRetweets: '',
  keepIds: '',
  excludeKeywords: '',
};

export const MENTION_MODES: MentionMode[] = ['all', 'only', 'exclude'];

export const MENTION_LABELS: Record<MentionMode, string> = {
  all: '모든 글 포함',
  only: '멘션만 포함 (@로 시작하거나 남에게 단 답글)',
  exclude: '멘션 제외',
};

/** 화면 표시 순서 */
export const KEEP_FLAGS: KeepFlag[] = [
  'anyMedia',
  'ownMedia',
  'liked',
  'hasLikes',
  'retweeted',
  'hasRetweets',
  'bookmarked',
  'hasBookmarks',
];

export const KEEP_LABELS: Record<KeepFlag, string> = {
  anyMedia: '미디어가 있는 글 (사진·영상·GIF, 인용한 글 포함)',
  ownMedia: '내가 올린 미디어가 있는 글',
  liked: '내가 좋아요한 글',
  hasLikes: '좋아요가 1개 이상인 글',
  retweeted: '내가 리포스트한 글',
  hasRetweets: '리포스트가 1개 이상인 글',
  bookmarked: '내가 북마크한 글',
  hasBookmarks: '북마크가 1개 이상인 글',
};

// ── 능력 매트릭스 ────────────────────────────────────────────────────────────
// 이 표가 UI 잠금의 근거이자 판정의 경계다. 여기 없는 항목은 그 모드에서 읽지 않는다.

export const CAPABLE_FLAGS: Record<Mode, KeepFlag[]> = {
  // 아카이브는 카드가 아니라 zip 목록을 읽는다. "내가 눌렀는지"는 거기 없다
  archive: ['anyMedia'],
  sweep: KEEP_FLAGS,
};

export const CAPABLE_FIELDS: Record<Mode, KeepField[]> = {
  archive: [
    'kinds',
    'dateRange',
    'includeKeyword',
    'includeRegex',
    'keepMinLikes',
    'keepMinRetweets',
    'keepIds',
  ],
  // 스윕은 타임라인을 위에서부터 훑는다. 목록이 없어 범위·id·정확한 수치를 쓸 수 없다
  sweep: [],
};

const FLAG_REASONS: Record<Mode, Partial<Record<KeepFlag, string>>> = {
  archive: {
    ownMedia: '아카이브는 인용한 글의 미디어를 구분하지 못합니다',
    liked: '아카이브에서 like.js를 읽지 않습니다',
    hasLikes: '아래 "좋아요 N개 이상"으로 정확히 지정하세요',
    retweeted: '리포스트는 기본적으로 대상에서 빠집니다',
    hasRetweets: '아래 "리포스트 N개 이상"으로 정확히 지정하세요',
    bookmarked: '아카이브에 북마크 정보가 없습니다',
    hasBookmarks: '아카이브에 북마크 정보가 없습니다',
  },
  sweep: {},
};

const FIELD_REASONS: Record<Mode, Partial<Record<KeepField, string>>> = {
  archive: {},
  sweep: {
    kinds: '스윕은 원글과 답글을 나눠 고를 수 없습니다',
    dateRange: '스윕은 최신 글부터 훑어 내려가 기간을 지정할 수 없습니다',
    includeKeyword: '스윕은 카드 본문이 잘릴 수 있어 포함 조건을 쓰지 않습니다',
    includeRegex: '스윕은 카드 본문이 잘릴 수 있어 포함 조건을 쓰지 않습니다',
    keepMinLikes: '스윕은 정확한 수를 읽지 못합니다. 위의 "1개 이상"을 쓰세요',
    keepMinRetweets: '스윕은 정확한 수를 읽지 못합니다. 위의 "1개 이상"을 쓰세요',
    keepIds: '스윕은 지울 글 목록을 미리 알 수 없습니다',
  },
};

/** 그 모드에서 못 쓰는 이유. 쓸 수 있으면 null */
export function flagReason(mode: Mode, flag: KeepFlag): string | null {
  if (CAPABLE_FLAGS[mode].includes(flag)) return null;
  return FLAG_REASONS[mode][flag] ?? '이 모드에서는 판정할 수 없습니다';
}

export function fieldReason(mode: Mode, field: KeepField): string | null {
  if (CAPABLE_FIELDS[mode].includes(field)) return null;
  return FIELD_REASONS[mode][field] ?? '이 모드에서는 판정할 수 없습니다';
}

// ── 파싱 ─────────────────────────────────────────────────────────────────────

/** 쉼표로 나눈 키워드. 비교는 소문자로 한다(명세: 대소문자 구분 없음) */
export function keywordList(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

export function idList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((x) => x.replace(/\D/g, ''))
    .filter(Boolean);
}

/** 빈 값·잘못된 값은 "조건 없음". 0은 유효한 값이 아니다(모든 글이 걸린다) */
function threshold(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 'YYYY-MM-DD' → ISO. 빈 값·잘못된 날짜는 null(조건 없음)로 본다 */
function isoDay(raw: string, endOfDay = false): string | null {
  if (raw.trim() === '') return null;
  const d = new Date(endOfDay ? `${raw}T23:59:59` : raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isValidRegex(src: string): boolean {
  try {
    new RegExp(src, 'iu');
    return true;
  } catch {
    return false;
  }
}

function safeRegex(src: string): RegExp {
  try {
    return new RegExp(src, 'iu');
  } catch {
    // 잘못된 정규식은 아무 것도 매칭하지 않는다(대상 0)
    return /(?!)/;
  }
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

/** 남에게 말을 건 글. 답글이거나 본문이 @로 시작한다 */
function mentionMismatch(isMention: boolean, mode: MentionMode): boolean {
  if (mode === 'only') return !isMention;
  if (mode === 'exclude') return isMention;
  return false;
}

function hitsExcludeKeyword(text: string, f: KeepFilter): boolean {
  const lower = text.toLowerCase();
  return keywordList(f.excludeKeywords).some((k) => lower.includes(k));
}

const KEEP_TESTS_SWEEP: Record<KeepFlag, (i: TimelineItem) => boolean> = {
  anyMedia: (i) => i.hasMedia,
  ownMedia: (i) => i.ownMedia,
  liked: (i) => i.liked,
  hasLikes: (i) => i.hasLikes,
  retweeted: (i) => i.retweeted,
  hasRetweets: (i) => i.hasRetweets,
  bookmarked: (i) => i.bookmarked,
  hasBookmarks: (i) => i.hasBookmarks,
};

const KEEP_TESTS_ARCHIVE: Partial<Record<KeepFlag, (p: TargetPost) => boolean>> = {
  anyMedia: (p) => p.hasMedia,
};

export function isMentionItem(item: TimelineItem): boolean {
  return item.reply || item.text.trimStart().startsWith('@');
}

export function isMentionPost(post: TargetPost): boolean {
  return post.inReplyToId !== null || post.text.trimStart().startsWith('@');
}

/**
 * 스윕이 훑을 프로필 탭 (ADR-0016).
 *
 * 기본은 "전체" 탭이다. 원글·미디어·리포스트가 다 거기 있고, 답글 탭에는 **답글밖에 없다**.
 * 답글만 노리는 필터(멘션만 포함)일 때만 답글 탭으로 간다 — 그때는 전체 탭을 훑어봐야
 * 대부분을 보존 판정으로 버리게 되므로, 답글만 모인 타임라인이 훨씬 빠르다.
 *
 * '멘션 제외'는 답글이 아닌 글을 지우겠다는 뜻이므로 전체 탭이 맞다.
 */
export function sweepTabOf(f: KeepFilter): SweepTab {
  return f.mention === 'only' ? 'with_replies' : 'all';
}

/** true면 스윕 삭제 대상에서 뺀다 */
export function isKeptSweep(item: TimelineItem, f: KeepFilter): boolean {
  if (mentionMismatch(isMentionItem(item), f.mention)) return true;
  for (const flag of f.keep) {
    if (!CAPABLE_FLAGS.sweep.includes(flag)) continue;
    if (KEEP_TESTS_SWEEP[flag](item)) return true;
  }
  return hitsExcludeKeyword(item.text, f);
}

/** true면 아카이브 삭제 대상이다 */
export function isTargetArchive(post: TargetPost, f: KeepFilter): boolean {
  // 종류를 둘 다 끄면 대상 0이다. 기본값으로 되돌리면 안 끄느니만 못하다
  if (!f.kinds.includes(post.kind)) return false;
  if (mentionMismatch(isMentionPost(post), f.mention)) return false;
  const from = isoDay(f.from);
  if (from !== null && post.createdAt < from) return false;
  const to = isoDay(f.to, true);
  if (to !== null && post.createdAt > to) return false;
  if (
    f.includeKeyword.trim() !== '' &&
    !post.text.toLowerCase().includes(f.includeKeyword.trim().toLowerCase())
  )
    return false;
  if (f.includeRegex !== '' && !safeRegex(f.includeRegex).test(post.text)) return false;
  if (idList(f.keepIds).includes(post.id)) return false;

  for (const flag of f.keep) {
    const test = CAPABLE_FLAGS.archive.includes(flag) ? KEEP_TESTS_ARCHIVE[flag] : undefined;
    if (test?.(post)) return false;
  }
  const minLikes = threshold(f.keepMinLikes);
  if (minLikes !== null && post.likeCount >= minLikes) return false;
  const minRts = threshold(f.keepMinRetweets);
  if (minRts !== null && post.retweetCount >= minRts) return false;

  return !hitsExcludeKeyword(post.text, f);
}

export function selectTargets<T extends TargetPost>(posts: T[], f: KeepFilter): T[] {
  return posts.filter((p) => isTargetArchive(p, f));
}

// ── 요약 ─────────────────────────────────────────────────────────────────────

/** 그 모드에서 실제로 무언가를 거르는가. 못 쓰는 필드는 세지 않는다 */
export function isFilterActive(f: KeepFilter, mode: Mode): boolean {
  return keepReasons(f, mode).length > 0;
}

/**
 * 시작 직전 되읽기용. "무엇을 남기는가"를 사람 문장으로 돌려준다.
 * 화면과 판정이 같은 표를 보므로 여기에 나오지 않는 조건은 적용되지도 않는다.
 */
export function keepReasons(f: KeepFilter, mode: Mode): string[] {
  const out: string[] = [];
  if (f.mention === 'only') out.push('멘션이 아닌 글');
  if (f.mention === 'exclude') out.push('멘션');
  for (const flag of KEEP_FLAGS) {
    if (f.keep.includes(flag) && CAPABLE_FLAGS[mode].includes(flag)) out.push(KEEP_LABELS[flag]);
  }
  if (CAPABLE_FIELDS[mode].includes('keepMinLikes')) {
    const n = threshold(f.keepMinLikes);
    if (n !== null) out.push(`좋아요 ${n}개 이상`);
  }
  if (CAPABLE_FIELDS[mode].includes('keepMinRetweets')) {
    const n = threshold(f.keepMinRetweets);
    if (n !== null) out.push(`리포스트 ${n}개 이상`);
  }
  if (CAPABLE_FIELDS[mode].includes('keepIds')) {
    const ids = idList(f.keepIds);
    if (ids.length > 0) out.push(`지정한 글 ${ids.length}개`);
  }
  const kw = keywordList(f.excludeKeywords);
  if (kw.length > 0) out.push(`키워드 ${kw.map((k) => `"${k}"`).join('·')}`);
  if (CAPABLE_FIELDS[mode].includes('kinds')) {
    if (!f.kinds.includes('post')) out.push('원글 전부');
    if (!f.kinds.includes('reply')) out.push('답글 전부');
  }
  if (CAPABLE_FIELDS[mode].includes('dateRange')) {
    if (f.from !== '') out.push(`${f.from} 이전 글`);
    if (f.to !== '') out.push(`${f.to} 이후 글`);
  }
  if (CAPABLE_FIELDS[mode].includes('includeKeyword') && f.includeKeyword.trim() !== '')
    out.push(`"${f.includeKeyword.trim()}"이 없는 글`);
  if (CAPABLE_FIELDS[mode].includes('includeRegex') && f.includeRegex !== '')
    out.push('정규식에 맞지 않는 글');
  return out;
}

// ── 저장값 보정 ──────────────────────────────────────────────────────────────

/** 구버전 스윕 필터. 플래그 이름은 그대로라 그대로 옮긴다 */
interface LegacySweepFilter {
  mention?: unknown;
  exclude?: unknown;
  keywords?: unknown;
}

function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * 저장값이 손상됐거나 구버전이면 보정한다.
 * 던지지 않는다 — 읽기 실패와 "필터 없음"을 구별하는 건 호출자(화면)의 몫이다.
 */
export function coerceKeepFilter(raw: unknown): KeepFilter {
  const r = (raw ?? {}) as Partial<KeepFilter> & LegacySweepFilter;
  const storedKeep: unknown[] = Array.isArray(r.keep)
    ? r.keep
    : Array.isArray(r.exclude)
      ? r.exclude
      : [];
  // 배열이면 사용자가 고른 값이다. 비어 있어도 존중한다(대상 0). 배열이 아닐 때만 기본값
  const storedKinds: unknown[] = Array.isArray(r.kinds) ? r.kinds : DEFAULT_KINDS;
  return {
    mention: MENTION_MODES.includes(r.mention as MentionMode) ? (r.mention as MentionMode) : 'all',
    // KEEP_FLAGS로 걸러 모르는 값은 버리고 표시 순서를 유지한다
    keep: KEEP_FLAGS.filter((f) => storedKeep.includes(f)),
    kinds: DEFAULT_KINDS.filter((k) => storedKinds.includes(k)),
    from: str(r.from, 10),
    to: str(r.to, 10),
    includeKeyword: str(r.includeKeyword, KEYWORDS_MAX),
    includeRegex: str(r.includeRegex, KEYWORDS_MAX),
    keepMinLikes: str(r.keepMinLikes, 12),
    keepMinRetweets: str(r.keepMinRetweets, 12),
    keepIds: str(r.keepIds),
    // 구버전 키 keywords가 제외 키워드였다
    excludeKeywords: str(r.excludeKeywords || r.keywords, KEYWORDS_MAX),
  };
}
