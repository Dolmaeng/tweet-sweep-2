// ui-click 실행기 (ADR-0005 기본). 로그인 세션의 실제 UI를 눌러 삭제한다.
// 셀렉터는 2026-09 조사 기준. 설정으로 라벨을 덮어쓸 수 있고, 실패 시 진단 수치를 detail에 담는다.
import type { ExecutionResult } from '../core/models';
import type { PageKind, UiClickConfig } from './types';

export const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 더보기(…) 버튼. data-testid="caret"가 X의 "More" 트리거. 재게시/답글 버튼과 구별된다.
// 주의: aria-haspopup 같은 넓은 셀렉터는 재게시 버튼을 잘못 집으니 쓰지 않는다.
export const CARET_SELECTORS = [
  '[data-testid="caret"]',
  '[aria-label="More"]',
  '[aria-label="더 보기"]',
];

/** twid 쿠키(`u%3D<id>`)에서 사용자 id 추출 (FR-03) */
export function extractTwid(cookie: string): string | null {
  const m = /(?:^|;\s*)twid=([^;]+)/.exec(cookie);
  if (!m?.[1]) return null;
  const decoded = decodeURIComponent(m[1]);
  const d = /u=?(\d+)/.exec(decoded) ?? /(\d+)/.exec(decoded);
  return d?.[1] ?? null;
}

export function detectPageKind(doc: Document, pathname: string): PageKind {
  if (/^\/(i\/flow\/login|login|i\/flow\/signup|logout)/.test(pathname)) return 'login';
  if (/^\/account\/access/.test(pathname)) return 'locked';
  if (doc.querySelector('article[data-testid="tweet"]')) return 'tweet';
  if (doc.querySelector('[data-testid="error-detail"]')) return 'not_found';
  return 'unknown';
}

/**
 * 삭제 대상 글. 상태 페이지는 답글이면 **원글(남의 글)을 위에 먼저** 렌더하므로 첫 article은 대상이
 * 아닐 수 있다(2026-09-17 라이브에서 원글 메뉴가 열려 실패). 그래서 `/status/<postId>` 링크를 가진
 * article을 고른다. 링크 매칭이 안 되고 article이 하나뿐이면 그것을 쓴다(렌더 초기·구형 DOM 대비).
 */
export function findTargetArticle(doc: Document, postId: string): Element | null {
  const articles = Array.from(doc.querySelectorAll('article[data-testid="tweet"]'));
  return findCardArticle(doc, postId) ?? (articles.length === 1 ? articles[0]! : null);
}

/**
 * 링크가 그 글을 가리키는 카드만. "하나뿐이면 허용"이 없다.
 * 타임라인에는 카드가 여럿이므로 그 완화가 다른 카드를 집는 사고가 된다 (ADR-0016).
 */
export function findCardArticle(doc: Document, postId: string): Element | null {
  const re = new RegExp(`/status/${postId}(?:[/?#]|$)`);
  for (const a of doc.querySelectorAll('article[data-testid="tweet"]')) {
    const links = Array.from(a.querySelectorAll<HTMLAnchorElement>('a[href]'));
    if (links.some((l) => re.test(l.getAttribute('href') ?? ''))) return a;
  }
  return null;
}

export function findCaret(scope: ParentNode): HTMLElement | null {
  for (const sel of CARET_SELECTORS) {
    const el = scope.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/**
 * 포커스된 글의 더보기 버튼. 상태 페이지에서 X는 그 버튼을 article 밖 헤더에 두기도 한다.
 * 문서 전체에서는 반드시 data-testid="caret"만 쓰고(왼쪽 내비의 "더 보기" 배제), **다른 article 안의
 * caret은 제외**한다(위에 렌더된 원글의 caret을 집으면 남의 글 메뉴가 열린다).
 */
export function findFocusedCaret(doc: Document): HTMLElement | null {
  const carets = Array.from(doc.querySelectorAll<HTMLElement>('[data-testid="caret"]'));
  return carets.find((c) => c.closest('article') === null) ?? null;
}

function itemLabel(el: Element): string {
  const text = (el.textContent ?? '').trim();
  const aria = el.getAttribute('aria-label') ?? '';
  const testid = el.getAttribute('data-testid') ?? '';
  return `${text} ${aria} ${testid}`;
}

export function findDeleteMenuItem(doc: Document, labels: string[]): HTMLElement | null {
  const items = Array.from(doc.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  return items.find((el) => labels.some((l) => itemLabel(el).includes(l))) ?? null;
}

/** 열린 메뉴 항목들의 라벨 목록(진단용) */
export function menuLabels(doc: Document): string {
  return Array.from(doc.querySelectorAll('[role="menuitem"]'))
    .map((el) => itemLabel(el).replace(/\s+/g, ' ').trim().slice(0, 24) || '?')
    .join(' | ');
}

export function findConfirm(doc: Document): HTMLElement | null {
  return doc.querySelector('[data-testid="confirmationSheetConfirm"]');
}

export async function waitFor<T>(
  get: () => T | null,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() >= deadline) return null;
    await sleep(50);
  }
}

function domCounts(doc: Document): string {
  const articles = doc.querySelectorAll('article[data-testid="tweet"]').length;
  const carets = doc.querySelectorAll('[data-testid="caret"]').length;
  const menuitems = doc.querySelectorAll('[role="menuitem"]').length;
  return `articles=${articles},carets=${carets},menuitems=${menuitems}`;
}

/**
 * 한 건 삭제: 페이지 판정 → 첫 글 → caret → 삭제 메뉴 → 확인.
 * 각 단계 실패 시 signal과 진단 수치를 담는다. 클릭·대기는 주입된 sleep으로 테스트 가능.
 */
export async function deletePost(
  doc: Document,
  pathname: string,
  postId: string,
  config: UiClickConfig,
  sleep: (ms: number) => Promise<void> = sleepMs,
): Promise<ExecutionResult> {
  const kind = detectPageKind(doc, pathname);
  if (kind === 'not_found') return { kind: 'gone' };
  if (kind === 'login') return { kind: 'blocked', signal: 'auth_redirect' };
  if (kind === 'locked') return { kind: 'blocked', signal: 'account_locked' };
  // 글이 아니라 페이지가 안 열린 것이다. 셀렉터가 바뀐 것(dom_changed)과 구별해야
  // 이 글의 재시도 횟수를 깎지 않고 물러나 기다릴 수 있다 (ADR-0014)
  if (kind !== 'tweet')
    return { kind: 'error', signal: 'page_unavailable', detail: `page:${kind}` };

  const article = await waitFor(
    () => findTargetArticle(doc, postId),
    config.timeouts.element,
    sleep,
  );
  if (!article)
    return { kind: 'error', signal: 'dom_changed', detail: `target(${domCounts(doc)})` };

  // 대상 글 안의 더보기를 먼저, 없으면 포커스된 글의 더보기(article 밖 헤더)를 쓴다.
  const caret = await waitFor(
    () => findCaret(article) ?? findFocusedCaret(doc),
    config.timeouts.element,
    sleep,
  );
  if (!caret) return { kind: 'error', signal: 'dom_changed', detail: `caret(${domCounts(doc)})` };
  caret.click();

  const item = await waitFor(
    () => findDeleteMenuItem(doc, config.labels),
    config.timeouts.element,
    sleep,
  );
  if (!item)
    return { kind: 'error', signal: 'dom_changed', detail: `menuitem[${menuLabels(doc)}]` };
  item.click();

  const confirm = await waitFor(() => findConfirm(doc), config.timeouts.confirm, sleep);
  if (!confirm) return { kind: 'error', signal: 'dom_changed', detail: 'confirm' };
  confirm.click();

  return { kind: 'ok' };
}

// ── 재게시 취소 (ADR-0016) ───────────────────────────────────────────────────
// 2026-09-23 라이브 확인: 내가 재게시한 카드의 재게시 버튼은 data-testid="unretweet"
// (aria-label "801 재게시. 재게시함"). 누르면 메뉴가 열리고 그 안의
// data-testid="unretweetConfirm"("재게시 취소") 한 번으로 끝난다. 확인 시트는 없다.

/** 내가 누른 재게시임을 나타내는 버튼. 안 누른 카드는 data-testid="retweet" */
export const UNRETWEET_SELECTOR = '[data-testid="unretweet"]';
export const UNRETWEET_CONFIRM_SELECTOR = '[data-testid="unretweetConfirm"]';

export function findUnretweetButton(scope: ParentNode): HTMLElement | null {
  return scope.querySelector<HTMLElement>(UNRETWEET_SELECTOR);
}

export function findUnretweetConfirm(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(UNRETWEET_CONFIRM_SELECTOR);
}

/**
 * 리포스트 한 건 취소: 카드 찾기 → 재게시 버튼 → "재게시 취소".
 *
 * 삭제와 달리 **caret 메뉴를 열지 않는다.** 리포스트 카드의 caret은 원작성자에 대한
 * 메뉴(언팔로우·차단·신고)라, 거기서 무언가를 누르면 내 의도와 전혀 다른 일이 벌어진다
 * (2026-09-17 라이브 사고). 카드도 링크가 일치하는 것만 쓴다 — 타임라인에는 카드가 여럿이라
 * "하나뿐이면 허용"이 남의 재게시를 취소하는 길이 된다.
 */
export async function undoRepost(
  doc: Document,
  pathname: string,
  postId: string,
  config: UiClickConfig,
  sleep: (ms: number) => Promise<void> = sleepMs,
): Promise<ExecutionResult> {
  const kind = detectPageKind(doc, pathname);
  if (kind === 'not_found') return { kind: 'gone' };
  if (kind === 'login') return { kind: 'blocked', signal: 'auth_redirect' };
  if (kind === 'locked') return { kind: 'blocked', signal: 'account_locked' };
  if (kind !== 'tweet')
    return { kind: 'error', signal: 'page_unavailable', detail: `page:${kind}` };

  const article = await waitFor(() => findCardArticle(doc, postId), config.timeouts.element, sleep);
  if (!article) return { kind: 'error', signal: 'dom_changed', detail: `card(${domCounts(doc)})` };

  const button = findUnretweetButton(article);
  if (!button) {
    // 이미 취소됐으면 재게시 버튼이 "retweet" 상태로 돌아가 있다. 치울 게 없으니 gone이다.
    // 둘 다 없으면 카드 구조가 바뀐 것이라 손대지 않는다.
    return article.querySelector('[data-testid="retweet"]')
      ? { kind: 'gone' }
      : { kind: 'error', signal: 'dom_changed', detail: 'unretweet-button' };
  }
  button.click();

  const confirm = await waitFor(() => findUnretweetConfirm(doc), config.timeouts.confirm, sleep);
  if (!confirm)
    return { kind: 'error', signal: 'dom_changed', detail: `unretweetConfirm[${menuLabels(doc)}]` };
  confirm.click();

  return { kind: 'ok' };
}
