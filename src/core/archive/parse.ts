// X 데이터 아카이브 파서. 순수 TS. 입력은 파일 텍스트, 출력은 도메인 모델 (ADR-0003, FR-01·02).
import type { ArchiveSummary, Post, PostKind } from '../models';

/** data/tweets.js, data/tweets-part1.js, 구형 data/tweet.js, data/tweet-part1.js */
const TWEETS_FILE = /(^|\/)tweets?(-part\d+)?\.js$/i;
const ACCOUNT_FILE = /(^|\/)account\.js$/i;
const EPOCH = '1970-01-01T00:00:00.000Z';

export function isTweetsFile(name: string): boolean {
  return TWEETS_FILE.test(name);
}

export function isAccountFile(name: string): boolean {
  return ACCOUNT_FILE.test(name);
}

/** part 번호 순으로 정렬한다. part 없음 = 0 */
export function partIndex(name: string): number {
  const m = /-part(\d+)\.js$/i.exec(name);
  return m ? Number(m[1]) : 0;
}

export class ArchiveFormatError extends Error {
  override name = 'ArchiveFormatError';
}

/** `window.YTD.tweets.part0 = [...]` → `[...]` */
export function stripYtdPrefix(text: string): string {
  const eq = text.indexOf('=');
  const head = eq === -1 ? '' : text.slice(0, eq);
  if (eq === -1 || !/window\.YTD\./.test(head)) {
    throw new ArchiveFormatError(
      'YTD 접두어가 없습니다. X 데이터 아카이브의 data/*.js 파일이 맞는지 확인하세요.',
    );
  }
  return text.slice(eq + 1).trim();
}

interface RawMedia {
  type?: unknown;
}

export interface RawTweet {
  id_str?: unknown;
  id?: unknown;
  full_text?: unknown;
  created_at?: unknown;
  in_reply_to_status_id_str?: unknown;
  in_reply_to_status_id?: unknown;
  favorite_count?: unknown;
  retweet_count?: unknown;
  entities?: { media?: unknown };
  extended_entities?: { media?: unknown };
}

interface RawTweetEntry {
  tweet?: RawTweet;
}

function parseJsonArray(text: string, label: string): unknown[] {
  const json = stripYtdPrefix(text);
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    throw new ArchiveFormatError(`${label} 파일 JSON 파싱 실패: ${(e as Error).message}`);
  }
  if (!Array.isArray(value)) throw new ArchiveFormatError(`${label} 파일 최상위가 배열이 아닙니다.`);
  return value;
}

/** tweets.js 텍스트 → Post[] (순서 유지, 형식 오류는 예외) */
export function parseTweetsText(text: string): Post[] {
  const entries = parseJsonArray(text, 'tweets') as RawTweetEntry[];
  const posts: Post[] = [];
  for (const entry of entries) {
    const t = entry?.tweet;
    if (!t) continue;
    const post = toPost(t);
    if (post) posts.push(post);
  }
  return posts;
}

/** 여러 part 파일을 part 순으로 병합하고 id 기준 중복 제거 */
export function mergeParts(parts: { name: string; posts: Post[] }[]): Post[] {
  const seen = new Set<string>();
  const out: Post[] = [];
  for (const p of [...parts].sort((a, b) => partIndex(a.name) - partIndex(b.name))) {
    for (const post of p.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      out.push(post);
    }
  }
  return out;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function toPost(t: RawTweet): Post | null {
  const id = str(t.id_str) ?? str(t.id);
  if (!id) return null;
  const text = str(t.full_text) ?? '';
  const inReplyToId = str(t.in_reply_to_status_id_str) ?? str(t.in_reply_to_status_id);
  const media = extractMedia(t);
  return {
    id,
    createdAt: parseCreatedAt(str(t.created_at)),
    kind: classify(text, inReplyToId),
    text,
    inReplyToId,
    hasMedia: media.length > 0,
    mediaTypes: media,
    likeCount: num(t.favorite_count),
    retweetCount: num(t.retweet_count),
    raw: t,
  };
}

/** 리포스트: full_text가 `RT @`로 시작. 답글: in_reply_to_status_id 존재. 그 외 원글 (FR-02) */
export function classify(text: string, inReplyToId: string | null): PostKind {
  if (/^RT @\w+/.test(text)) return 'retweet';
  if (inReplyToId) return 'reply';
  return 'post';
}

function extractMedia(t: RawTweet): string[] {
  const list = t.extended_entities?.media ?? t.entities?.media;
  if (!Array.isArray(list)) return [];
  return (list as RawMedia[]).map((m) => (typeof m?.type === 'string' ? m.type : 'unknown'));
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** "Wed Oct 10 20:19:24 +0000 2018" → "2018-10-10T20:19:24.000Z". 엔진 의존 없는 직접 파싱 */
export function parseCreatedAt(value: string | null): string {
  if (!value) return EPOCH;
  const m = /^\w{3} (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4}) (\d{4})$/.exec(value);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? EPOCH : d.toISOString();
  }
  const mon = m[1] ?? '';
  const month = MONTHS[mon];
  if (month === undefined) return EPOCH;
  const tz = m[6] ?? '+0000';
  const sign = tz.startsWith('-') ? -1 : 1;
  const offsetMin = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  const utcMs =
    Date.UTC(Number(m[7]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])) -
    offsetMin * 60_000;
  return new Date(utcMs).toISOString();
}

export interface ArchiveAccount {
  userId: string;
  username: string;
}

/** account.js → accountId·username만 반환. 이메일·전화 등 나머지는 버린다 (P2) */
export function parseAccountText(text: string): ArchiveAccount {
  const entries = parseJsonArray(text, 'account');
  const first = entries[0] as { account?: { accountId?: unknown; username?: unknown } } | undefined;
  const userId = str(first?.account?.accountId);
  const username = str(first?.account?.username);
  if (!userId || !username) {
    throw new ArchiveFormatError('account.js에서 accountId/username을 찾지 못했습니다.');
  }
  return { userId, username };
}

export function summarize(posts: Post[], account: ArchiveAccount): ArchiveSummary {
  const byKind: Record<PostKind, number> = { post: 0, reply: 0, retweet: 0 };
  const byYear: Record<string, number> = {};
  let withMedia = 0;
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const p of posts) {
    byKind[p.kind] += 1;
    if (p.hasMedia) withMedia += 1;
    const y = p.createdAt.slice(0, 4);
    byYear[y] = (byYear[y] ?? 0) + 1;
    if (earliest === null || p.createdAt < earliest) earliest = p.createdAt;
    if (latest === null || p.createdAt > latest) latest = p.createdAt;
  }
  return {
    account,
    total: posts.length,
    byKind,
    withMedia,
    byYear,
    earliestAt: earliest,
    latestAt: latest,
  };
}
