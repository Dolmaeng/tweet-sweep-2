import { afterEach, describe, expect, it } from 'vitest';
import {
  isPinnedCard,
  isReplyCard,
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
  /** 본문 앞에 붙는 안내(답글 등) */
  chrome?: string;
  /** 액션 바 내용 */
  actions?: string;
  media?: string;
}) => `
  <article data-testid="tweet">
    ${opts.context ? `<span data-testid="socialContext">${opts.context}</span>` : ''}
    ${opts.chrome ?? ''}
    <a href="/${opts.handle}/status/${opts.id}"><time datetime="${opts.time ?? '2024-12-12T00:00:00.000Z'}"></time></a>
    <div data-testid="tweetText">${opts.text ?? ''}</div>
    ${opts.media ?? ''}
    <div role="group">${opts.actions ?? ''}</div>
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
        reply: false,
        liked: false,
        hasLikes: false,
        retweeted: false,
        hasRetweets: false,
        bookmarked: false,
        hasBookmarks: false,
        ownMedia: false,
        hasMedia: false,
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

describe('isReplyCard', () => {
  it('reads the reply notice that sits outside the body', () => {
    const doc = setBody(
      CARD({ handle: 'a', id: '1', chrome: '<div>@someone님에게 보내는 답글</div>' }) +
        CARD({ handle: 'a', id: '2', chrome: '<div>Replying to @someone</div>' }),
    );
    const cards = doc.querySelectorAll('article');
    expect(isReplyCard(cards[0]!)).toBe(true);
    expect(isReplyCard(cards[1]!)).toBe(true);
  });

  it('is not fooled by the reply button or by the word inside the body', () => {
    const doc = setBody(
      CARD({
        handle: 'a',
        id: '1',
        text: '답글 좀 달아주세요',
        actions: '<button data-testid="reply" aria-label="답글 3개. 답글"></button>',
      }),
    );
    expect(isReplyCard(doc.querySelector('article')!)).toBe(false);
  });
});

describe('scanTimeline — 필터 신호', () => {
  it('reads which actions I took from the post-action testids', () => {
    const doc = setBody(
      CARD({
        handle: 'a',
        id: '1',
        actions: `
          <button data-testid="unlike" aria-label="좋아요"></button>
          <button data-testid="unretweet" aria-label="재게시"></button>
          <button data-testid="removeBookmark" aria-label="북마크"></button>`,
      }),
    );
    expect(scanTimeline(doc)[0]).toMatchObject({
      liked: true,
      retweeted: true,
      bookmarked: true,
      // 라벨에 숫자가 없으므로 수치는 0이다
      hasLikes: false,
      hasRetweets: false,
      hasBookmarks: false,
    });
  });

  it('treats a number on the action button as a count of 1 or more', () => {
    const doc = setBody(
      CARD({
        handle: 'a',
        id: '1',
        actions: `
          <button data-testid="like" aria-label="좋아요 12개. 좋아요"></button>
          <button data-testid="retweet" aria-label="재게시"><span>1.2천</span></button>
          <button data-testid="bookmark" aria-label="북마크"></button>`,
      }),
    );
    expect(scanTimeline(doc)[0]).toMatchObject({
      liked: false,
      hasLikes: true,
      hasRetweets: true,
      hasBookmarks: false,
    });
  });

  it('counts media in a quoted post as media, but not as mine', () => {
    const doc = setBody(
      CARD({
        handle: 'a',
        id: '1',
        media: '<div role="link"><div data-testid="tweetPhoto"></div></div>',
      }) +
        CARD({
          handle: 'a',
          id: '2',
          media: '<div data-testid="videoPlayer"></div>',
        }),
    );
    const items = scanTimeline(doc);
    expect(items[0]).toMatchObject({ hasMedia: true, ownMedia: false });
    expect(items[1]).toMatchObject({ hasMedia: true, ownMedia: true });
  });
});
