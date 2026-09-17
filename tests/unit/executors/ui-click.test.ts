import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_UI_CONFIG } from '../../../src/executors/types';
import {
  deletePost,
  detectPageKind,
  extractTwid,
  findCaret,
  findConfirm,
  findDeleteMenuItem,
  findTargetArticle,
} from '../../../src/executors/ui-click';

const noSleep = () => Promise.resolve();

function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extractTwid', () => {
  it('decodes the u=<id> form', () => {
    expect(extractTwid('ct0=abc; twid=u%3D1849012345678; lang=ko')).toBe('1849012345678');
    expect(extractTwid('twid="u=42"')).toBe('42');
    expect(extractTwid('ct0=abc')).toBeNull();
  });
});

describe('detectPageKind', () => {
  it('recognizes login and locked by path before DOM', () => {
    expect(detectPageKind(setBody(''), '/i/flow/login')).toBe('login');
    expect(detectPageKind(setBody(''), '/account/access')).toBe('locked');
  });
  it('recognizes a tweet page and a deleted-post page', () => {
    expect(detectPageKind(setBody('<article data-testid="tweet"></article>'), '/u/status/1')).toBe(
      'tweet',
    );
    expect(detectPageKind(setBody('<div data-testid="error-detail"></div>'), '/u/status/1')).toBe(
      'not_found',
    );
    expect(detectPageKind(setBody('<div></div>'), '/u/status/1')).toBe('unknown');
  });
});

const TWEET_PAGE = `
  <article data-testid="tweet">
    <a href="/gujik_man/status/999"></a>
    <button data-testid="caret" aria-label="More"></button>
  </article>
  <div role="menu">
    <div role="menuitem"><span>분석</span></div>
    <div role="menuitem"><span>삭제</span></div>
  </div>
  <button data-testid="confirmationSheetConfirm">삭제</button>
`;

describe('element finders', () => {
  it('finds the first tweet article, its caret, delete item, and confirm', () => {
    const doc = setBody(TWEET_PAGE);
    const article = findTargetArticle(doc, '999');
    expect(article).not.toBeNull();
    expect(findCaret(article!)).not.toBeNull();
    expect(findDeleteMenuItem(doc, DEFAULT_UI_CONFIG.labels)?.textContent?.trim()).toBe('삭제');
    expect(findConfirm(doc)).not.toBeNull();
  });

  it('finds a caret by aria-label fallback when the testid is absent', () => {
    const doc = setBody(
      '<article data-testid="tweet"><button aria-label="더 보기"></button></article>',
    );
    expect(findCaret(findTargetArticle(doc, '1')!)).not.toBeNull();
  });

  it('matches a delete item by aria-label or data-testid, not only text', () => {
    const byAria = setBody('<div role="menuitem" aria-label="Delete"></div>');
    expect(findDeleteMenuItem(byAria, ['Delete'])).not.toBeNull();
    const byTestid = setBody('<div role="menuitem" data-testid="삭제"></div>');
    expect(findDeleteMenuItem(byTestid, ['삭제'])).not.toBeNull();
  });
});

describe('deletePost', () => {
  it('walks caret → delete → confirm and returns ok', async () => {
    const doc = setBody(TWEET_PAGE);
    const caret = doc.querySelector<HTMLElement>('[data-testid="caret"]')!;
    const confirm = doc.querySelector<HTMLElement>('[data-testid="confirmationSheetConfirm"]')!;
    const caretClick = vi.spyOn(caret, 'click');
    const confirmClick = vi.spyOn(confirm, 'click');

    const result = await deletePost(
      doc,
      '/gujik_man/status/999',
      '999',
      DEFAULT_UI_CONFIG,
      noSleep,
    );

    expect(result).toEqual({ kind: 'ok' });
    expect(caretClick).toHaveBeenCalledOnce();
    expect(confirmClick).toHaveBeenCalledOnce();
  });

  it('finds the focused tweet caret even when it sits outside the article (status page)', async () => {
    const doc = setBody(`
      <button data-testid="caret"></button>
      <article data-testid="tweet"><a href="/u/status/5"></a></article>
      <div role="menu"><div role="menuitem"><span>삭제</span></div></div>
      <button data-testid="confirmationSheetConfirm"></button>
    `);
    const caret = doc.querySelector<HTMLElement>('[data-testid="caret"]')!;
    const caretClick = vi.spyOn(caret, 'click');
    const result = await deletePost(doc, '/u/status/5', '5', DEFAULT_UI_CONFIG, noSleep);
    expect(result).toEqual({ kind: 'ok' });
    expect(caretClick).toHaveBeenCalledOnce();
  });

  it('targets the reply by id, not the parent tweet rendered above it', async () => {
    // 답글 상태 페이지: 남의 원글이 먼저 → 원글 caret을 누르면 언팔로우·차단 메뉴가 열린다(라이브 실패 사례)
    const doc = setBody(`
      <article data-testid="tweet">
        <a href="/other/status/111"></a>
        <button data-testid="caret" id="parent-caret"></button>
      </article>
      <article data-testid="tweet">
        <a href="/u/status/222?s=20"></a>
        <button data-testid="caret" id="target-caret"></button>
      </article>
      <div role="menu"><div role="menuitem"><span>삭제</span></div></div>
      <button data-testid="confirmationSheetConfirm"></button>
    `);
    const parent = vi.spyOn(doc.getElementById('parent-caret')!, 'click');
    const target = vi.spyOn(doc.getElementById('target-caret')!, 'click');
    const result = await deletePost(doc, '/u/status/222', '222', DEFAULT_UI_CONFIG, noSleep);
    expect(result).toEqual({ kind: 'ok' });
    expect(parent).not.toHaveBeenCalled();
    expect(target).toHaveBeenCalledOnce();
  });

  it('skips a parent article caret when the focused caret sits in the header', async () => {
    const doc = setBody(`
      <article data-testid="tweet">
        <a href="/other/status/111"></a>
        <button data-testid="caret" id="parent-caret"></button>
      </article>
      <button data-testid="caret" id="header-caret"></button>
      <article data-testid="tweet"><a href="/u/status/222"></a></article>
      <div role="menu"><div role="menuitem"><span>삭제</span></div></div>
      <button data-testid="confirmationSheetConfirm"></button>
    `);
    const parent = vi.spyOn(doc.getElementById('parent-caret')!, 'click');
    const header = vi.spyOn(doc.getElementById('header-caret')!, 'click');
    const result = await deletePost(doc, '/u/status/222', '222', DEFAULT_UI_CONFIG, noSleep);
    expect(result).toEqual({ kind: 'ok' });
    expect(parent).not.toHaveBeenCalled();
    expect(header).toHaveBeenCalledOnce();
  });

  it('refuses when several articles exist and none carries the target id', async () => {
    const doc = setBody(`
      <article data-testid="tweet"><a href="/other/status/111"></a><button data-testid="caret"></button></article>
      <article data-testid="tweet"><a href="/other/status/333"></a><button data-testid="caret"></button></article>
    `);
    const fast = { labels: ['삭제'], timeouts: { element: 20, confirm: 20 } };
    const result = await deletePost(doc, '/u/status/222', '222', fast, noSleep);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.detail).toMatch(/^target\(/);
  });

  it('does not treat a repost button as the more-menu caret', async () => {
    // 재게시 버튼은 aria-haspopup을 갖지만 caret이 아니다 → 잘못 눌러선 안 된다
    const doc = setBody(`
      <article data-testid="tweet">
        <a href="/u/status/6"></a>
        <button data-testid="retweet" aria-haspopup="menu" aria-label="재게시"></button>
      </article>
    `);
    const fast = { labels: ['삭제'], timeouts: { element: 20, confirm: 20 } };
    const result = await deletePost(doc, '/u/status/6', '6', fast, noSleep);
    expect(result.kind).toBe('error'); // caret을 못 찾아 멈춤(재게시 버튼을 누르지 않음)
    if (result.kind === 'error') expect(result.detail).toMatch(/^caret\(/);
  });

  it('maps a deleted post to gone and a login redirect to blocked', async () => {
    const gone = await deletePost(
      setBody('<div data-testid="error-detail"></div>'),
      '/u/status/1',
      '1',
      DEFAULT_UI_CONFIG,
      noSleep,
    );
    expect(gone).toEqual({ kind: 'gone' });

    const blocked = await deletePost(setBody(''), '/i/flow/login', '1', DEFAULT_UI_CONFIG, noSleep);
    expect(blocked).toEqual({ kind: 'blocked', signal: 'auth_redirect' });
  });

  it('reports the failing step with DOM counts when the caret is missing', async () => {
    const doc = setBody('<article data-testid="tweet"><a href="/u/status/1"></a></article>');
    const fast = { labels: ['삭제'], timeouts: { element: 20, confirm: 20 } };
    const result = await deletePost(doc, '/u/status/1', '1', fast, noSleep);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.signal).toBe('dom_changed');
      expect(result.detail).toMatch(/^caret\(articles=1,carets=0,menuitems=0\)$/);
    }
  });
});
