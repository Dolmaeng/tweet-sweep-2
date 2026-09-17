import { afterEach, describe, expect, it } from 'vitest';
import {
  isPinnedCard,
  isRepostCard,
  readSessionUsername,
  scanTimeline,
} from '../../../src/executors/timeline-scan';

function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

afterEach(() => {
  document.body.innerHTML = '';
});

const CARD = (opts: {
  handle: string;
  id: string;
  context?: string;
  text?: string;
  time?: string;
}) => `
  <article data-testid="tweet">
    ${opts.context ? `<span data-testid="socialContext">${opts.context}</span>` : ''}
    <a href="/${opts.handle}/status/${opts.id}"><time datetime="${opts.time ?? '2024-12-12T00:00:00.000Z'}"></time></a>
    <div data-testid="tweetText">${opts.text ?? ''}</div>
  </article>
`;

describe('readSessionUsername', () => {
  it('reads the handle from the nav profile link', () => {
    const doc = setBody('<a data-testid="AppTabBar_Profile_Link" href="/gujik_man"></a>');
    expect(readSessionUsername(doc)).toBe('gujik_man');
  });

  it('returns null when the link is missing or is not a bare handle', () => {
    expect(readSessionUsername(setBody(''))).toBeNull();
    expect(
      readSessionUsername(
        setBody('<a data-testid="AppTabBar_Profile_Link" href="/gujik_man/status/1"></a>'),
      ),
    ).toBeNull();
  });
});

describe('scanTimeline', () => {
  it('reads id, handle, text and time from each card', () => {
    const doc = setBody(CARD({ handle: 'gujik_man', id: '1734000000000000001', text: '안녕' }));
    expect(scanTimeline(doc)).toEqual([
      {
        postId: '1734000000000000001',
        handle: 'gujik_man',
        pinned: false,
        repost: false,
        text: '안녕',
        createdAt: '2024-12-12T00:00:00.000Z',
      },
    ]);
  });

  it('marks pinned and repost cards from the social context label', () => {
    const doc = setBody(
      CARD({ handle: 'gujik_man', id: '1', context: '고정됨' }) +
        CARD({ handle: 'other', id: '2', context: 'gujik_man님이 재게시했습니다' }),
    );
    const items = scanTimeline(doc);
    expect(items[0]).toMatchObject({ postId: '1', pinned: true, repost: false });
    expect(items[1]).toMatchObject({ postId: '2', handle: 'other', repost: true });
  });

  it('uses the timestamp link, not a quoted or parent status link', () => {
    // 인용글 링크가 먼저 나와도 <time>을 품은 링크가 그 카드의 permalink다
    const doc = setBody(`
      <article data-testid="tweet">
        <a href="/someone/status/999">인용</a>
        <a href="/gujik_man/status/1734000000000000007"><time datetime="2024-12-12T00:00:00.000Z"></time></a>
      </article>
    `);
    expect(scanTimeline(doc)[0]).toMatchObject({
      postId: '1734000000000000007',
      handle: 'gujik_man',
    });
  });

  it('skips cards with no permalink and keeps top-to-bottom order', () => {
    const doc = setBody(
      '<article data-testid="tweet"><span>광고</span></article>' +
        CARD({ handle: 'gujik_man', id: '10' }) +
        CARD({ handle: 'gujik_man', id: '11' }),
    );
    expect(scanTimeline(doc).map((i) => i.postId)).toEqual(['10', '11']);
  });

  it('detects labels in English too', () => {
    const doc = setBody(CARD({ handle: 'a', id: '1', context: 'Pinned' }));
    const article = doc.querySelector('article')!;
    expect(isPinnedCard(article)).toBe(true);
    expect(isRepostCard(article)).toBe(false);
  });
});
