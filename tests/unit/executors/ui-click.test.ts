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
    const article = findTargetArticle(doc);
    expect(article).not.toBeNull();
    expect(findCaret(article!)).not.toBeNull();
    expect(findDeleteMenuItem(doc, DEFAULT_UI_CONFIG.labels)?.textContent?.trim()).toBe('삭제');
    expect(findConfirm(doc)).not.toBeNull();
  });

  it('finds a caret by aria-label fallback when the testid is absent', () => {
    const doc = setBody(
      '<article data-testid="tweet"><button aria-label="더 보기"></button></article>',
    );
    expect(findCaret(findTargetArticle(doc)!)).not.toBeNull();
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
