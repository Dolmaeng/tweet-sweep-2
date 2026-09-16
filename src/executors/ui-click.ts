// ui-click 실행기 (ADR-0005 기본). 로그인 세션의 실제 UI를 눌러 삭제한다.
// 셀렉터는 2026-09 조사 기준 best-effort. 실제 확인은 T14. 설정으로 라벨을 덮어쓸 수 있다.
import type { ExecutionResult } from '../core/models';
import type { PageKind, UiClickConfig } from './types';

export const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

/** 대상 글의 article 요소. status 링크가 일치하는 것 우선, 없으면 첫 article */
export function findPrimaryArticle(doc: Document, postId: string): Element | null {
  const articles = Array.from(doc.querySelectorAll('article[data-testid="tweet"]'));
  const withLink = articles.find((a) => a.querySelector(`a[href*="/status/${postId}"]`));
  return withLink ?? articles[0] ?? null;
}

export function findCaret(article: Element): HTMLElement | null {
  return article.querySelector('[data-testid="caret"]');
}

export function findDeleteMenuItem(doc: Document, labels: string[]): HTMLElement | null {
  const items = Array.from(doc.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  return items.find((el) => labels.some((l) => el.textContent?.trim().includes(l))) ?? null;
}

export function findConfirm(doc: Document): HTMLElement | null {
  return doc.querySelector('[data-testid="confirmationSheetConfirm"]');
}

async function waitFor<T>(
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

/**
 * 한 건 삭제: 페이지 판정 → article → caret → 삭제 메뉴 → 확인.
 * 클릭·대기는 주입된 sleep으로 테스트 가능. 결과는 ok/gone/blocked/error.
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
  if (kind !== 'tweet') return { kind: 'error', signal: 'dom_changed', detail: `page:${kind}` };

  const article = await waitFor(
    () => findPrimaryArticle(doc, postId),
    config.timeouts.element,
    sleep,
  );
  if (!article) return { kind: 'error', signal: 'timeout', detail: 'article' };

  const caret = findCaret(article);
  if (!caret) return { kind: 'error', signal: 'dom_changed', detail: 'caret' };
  caret.click();

  const item = await waitFor(
    () => findDeleteMenuItem(doc, config.labels),
    config.timeouts.element,
    sleep,
  );
  if (!item) return { kind: 'error', signal: 'dom_changed', detail: 'menuitem' };
  item.click();

  const confirm = await waitFor(() => findConfirm(doc), config.timeouts.confirm, sleep);
  if (!confirm) return { kind: 'error', signal: 'dom_changed', detail: 'confirm' };
  confirm.click();

  return { kind: 'ok' };
}
