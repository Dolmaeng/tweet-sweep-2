// 타임라인 카드 수집 (FR-18, ADR-0009). DOM만 읽고 아무것도 누르지 않는다.
// 셀렉터 근거는 docs/learn/x-web-client.md.
import type { TimelineItem } from '../core/timeline';

/** 카드의 permalink: 타임스탬프(<time>)를 감싼 `/<handle>/status/<id>` 링크 */
const PERMALINK_RE = /^\/([^/]+)\/status\/(\d+)/;

export interface SessionInfo {
  /** 로그인한 계정 handle(@ 없음). 못 읽으면 null */
  username: string | null;
}

/**
 * 로그인 세션의 handle. 왼쪽 내비의 프로필 링크에서 읽는다.
 * 사용자가 입력하지 않으므로 다른 계정을 쓸 경로가 없다(ADR-0009).
 */
export function readSessionUsername(doc: Document): string | null {
  const selectors = [
    '[data-testid="AppTabBar_Profile_Link"]',
    'a[aria-label="Profile"]',
    'a[aria-label="프로필"]',
  ];
  for (const sel of selectors) {
    const href = doc.querySelector(sel)?.getAttribute('href') ?? '';
    const m = /^\/([A-Za-z0-9_]{1,15})$/.exec(href);
    if (m?.[1]) return m[1];
  }
  return null;
}

function permalinkOf(article: Element): { handle: string; postId: string } | null {
  // <time>을 품은 링크가 그 카드 자신의 permalink다. 인용·답글 링크와 구별된다.
  const links = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'));
  for (const a of links) {
    if (!a.querySelector('time')) continue;
    const m = PERMALINK_RE.exec(a.getAttribute('href') ?? '');
    if (m?.[1] && m[2]) return { handle: m[1], postId: m[2] };
  }
  return null;
}

function socialContextOf(article: Element): string {
  return (article.querySelector('[data-testid="socialContext"]')?.textContent ?? '').trim();
}

/** 상태가 바뀌는 액션 버튼. 누른 뒤의 testid가 있으면 내가 그 액션을 한 글이다 */
const ACTED = {
  liked: 'unlike',
  retweeted: 'unretweet',
  bookmarked: 'removeBookmark',
} as const;

/** 지표별 버튼 두 상태. 어느 쪽이든 숫자가 붙어 있으면 그 수치가 1 이상이다 */
const COUNTED = {
  hasLikes: ['like', 'unlike'],
  hasRetweets: ['retweet', 'unretweet'],
  hasBookmarks: ['bookmark', 'removeBookmark'],
} as const;

const MEDIA_SEL =
  '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"]';

/** 인용한 글은 카드 안에 role="link" 블록으로 들어간다. 그 안의 미디어는 내가 올린 것이 아니다 */
const QUOTE_SEL = '[role="link"]';

/** 본문과 액션 바를 뺀 카드 텍스트. 답글 안내·사회적 맥락만 남는다 */
const CHROME_STRIP = '[data-testid="tweetText"], [role="group"]';

/** "…에게 보내는 답글 | Replying to". 액션 바의 "답글" 버튼과 섞이지 않게 먼저 떼어낸다 */
const REPLY_LABEL_RE = /답글|replying to/i;

function chromeText(article: Element): string {
  const clone = article.cloneNode(true) as Element;
  for (const el of clone.querySelectorAll(CHROME_STRIP)) el.remove();
  return clone.textContent ?? '';
}

export function isReplyCard(article: Element): boolean {
  return REPLY_LABEL_RE.test(chromeText(article));
}

/**
 * 버튼에 숫자가 붙어 있으면 수치가 1 이상. 0이면 X는 숫자를 아예 그리지 않는다.
 * aria-label("좋아요 12개")을 먼저 보므로 표기가 축약("1.2천")돼도 판정이 흔들리지 않는다.
 */
function hasCount(article: Element, names: readonly string[]): boolean {
  return names.some((name) => {
    const btn = article.querySelector(`[data-testid="${name}"]`);
    if (!btn) return false;
    return /\d/.test(btn.getAttribute('aria-label') ?? '') || /\d/.test(btn.textContent ?? '');
  });
}

function inQuote(article: Element, node: Element): boolean {
  const quote = node.closest(QUOTE_SEL);
  return quote !== null && quote !== article && article.contains(quote);
}

function mediaOf(article: Element): { ownMedia: boolean; hasMedia: boolean } {
  const nodes = Array.from(article.querySelectorAll(MEDIA_SEL));
  return {
    ownMedia: nodes.some((n) => !inQuote(article, n)),
    hasMedia: nodes.length > 0,
  };
}

/** "고정됨 | Pinned" 같은 사회적 맥락 라벨 */
export function isPinnedCard(article: Element): boolean {
  return /고정|pinned/i.test(socialContextOf(article));
}

/** "OOO님이 재게시했습니다 | reposted" */
export function isRepostCard(article: Element): boolean {
  return /재게시|리트윗|repost|retweet/i.test(socialContextOf(article));
}

function textOf(article: Element): string {
  return (article.querySelector('[data-testid="tweetText"]')?.textContent ?? '').trim();
}

function createdAtOf(article: Element): string | null {
  return article.querySelector('time')?.getAttribute('datetime') ?? null;
}

/** 화면에 렌더된 타임라인 카드를 위에서 아래 순서로 읽는다 */
export function scanTimeline(doc: Document): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const article of doc.querySelectorAll('article[data-testid="tweet"]')) {
    const link = permalinkOf(article);
    if (!link) continue;
    items.push({
      postId: link.postId,
      handle: link.handle,
      pinned: isPinnedCard(article),
      repost: isRepostCard(article),
      text: textOf(article),
      createdAt: createdAtOf(article),
      reply: isReplyCard(article),
      liked: article.querySelector(`[data-testid="${ACTED.liked}"]`) !== null,
      retweeted: article.querySelector(`[data-testid="${ACTED.retweeted}"]`) !== null,
      bookmarked: article.querySelector(`[data-testid="${ACTED.bookmarked}"]`) !== null,
      hasLikes: hasCount(article, COUNTED.hasLikes),
      hasRetweets: hasCount(article, COUNTED.hasRetweets),
      hasBookmarks: hasCount(article, COUNTED.hasBookmarks),
      ...mediaOf(article),
    });
  }
  return items;
}
