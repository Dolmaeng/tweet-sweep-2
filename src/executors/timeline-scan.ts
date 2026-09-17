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
    });
  }
  return items;
}
