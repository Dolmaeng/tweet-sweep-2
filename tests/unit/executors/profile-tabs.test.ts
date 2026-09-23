import { afterEach, describe, expect, it } from 'vitest';
import {
  closeMenus,
  ensureLatestSort,
  ensureSweepTab,
  findFilterDropdown,
  findMenuItem,
  findSortRadios,
  findTabAnchor,
  isOnSweepTab,
  selectedTabHref,
  tabHrefs,
} from '../../../src/executors/profile-tabs';

const noSleep = () => Promise.resolve();

/** 2026-09-23 라이브 DOM을 그대로 줄인 것. 첫 탭만 드롭다운을 연다 */
function tabBar(selected: 'posts' | 'all' | 'with_replies'): string {
  const first = selected === 'all' ? '/gujik_man/all' : '/gujik_man';
  const label = selected === 'all' ? '전체' : '게시물';
  return `
    <div role="tablist">
      <a role="tab" href="${first}" aria-haspopup="menu"
         aria-selected="${selected !== 'with_replies'}">${label}</a>
      <a role="tab" href="/gujik_man/with_replies"
         aria-selected="${selected === 'with_replies'}">답글</a>
      <a role="tab" href="/gujik_man/reposts" aria-selected="false">재게시</a>
      <a role="tab" href="/gujik_man/media" aria-selected="false">미디어</a>
    </div>`;
}

function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isOnSweepTab', () => {
  it('선택된 탭의 href 끝으로 판정한다', () => {
    expect(isOnSweepTab(setBody(tabBar('all')), 'all')).toBe(true);
    expect(isOnSweepTab(setBody(tabBar('all')), 'with_replies')).toBe(false);
    expect(isOnSweepTab(setBody(tabBar('with_replies')), 'with_replies')).toBe(true);
  });

  it('"게시물"은 전체가 아니다 — 답글과 리포스트가 빠진 탭이다', () => {
    // 이걸 전체로 읽으면 답글을 영영 못 만난다. href에 /all이 없다는 것이 유일한 신호다
    const doc = setBody(tabBar('posts'));
    expect(selectedTabHref(doc)).toBe('/gujik_man');
    expect(isOnSweepTab(doc, 'all')).toBe(false);
  });

  it('탭 줄이 없으면 false — "모름"을 "맞음"으로 읽지 않는다', () => {
    expect(isOnSweepTab(setBody('<div></div>'), 'all')).toBe(false);
    expect(tabHrefs(setBody('<div></div>'))).toBe('no-tabs');
  });
});

describe('findTabAnchor · findFilterDropdown', () => {
  it('답글 탭은 평범한 앵커, 전체는 드롭다운 뒤에 있다', () => {
    const doc = setBody(tabBar('posts'));
    expect(findTabAnchor(doc, 'with_replies')?.getAttribute('href')).toBe(
      '/gujik_man/with_replies',
    );
    expect(findTabAnchor(doc, 'all')).toBeNull();
    expect(findFilterDropdown(doc)?.getAttribute('aria-haspopup')).toBe('menu');
  });
});

describe('findMenuItem', () => {
  it('정확히 일치하는 라벨을 고른다', () => {
    const doc = setBody(`
      <div role="menu">
        <div role="menuitem"><span>전체</span></div>
        <div role="menuitem"><span>게시물</span></div>
        <div role="menuitem"><span>하이라이트</span></div>
        <div role="menuitem"><span>정렬 기준</span></div>
      </div>`);
    expect(findMenuItem(doc, ['전체', 'All'])?.textContent).toBe('전체');
    expect(findMenuItem(doc, ['정렬 기준', 'Sort by'])?.textContent).toBe('정렬 기준');
    expect(findMenuItem(doc, ['없는 항목'])).toBeNull();
  });
});

describe('findSortRadios', () => {
  it('체크된 정렬을 읽는다', () => {
    const doc = setBody(`
      <div role="menu">
        <div role="menuitemradio" aria-checked="true">최신 순서</div>
        <div role="menuitemradio" aria-checked="false">인기</div>
      </div>`);
    const radios = findSortRadios(doc);
    expect(radios.map((r) => r.label)).toEqual(['최신 순서', '인기']);
    expect(radios[0]?.checked).toBe(true);
  });
});

describe('ensureSweepTab', () => {
  it('이미 맞으면 아무것도 누르지 않는다', async () => {
    const doc = setBody(tabBar('all'));
    let clicks = 0;
    for (const el of doc.querySelectorAll('[role="tab"]')) {
      el.addEventListener('click', () => (clicks += 1));
    }
    expect(await ensureSweepTab(doc, 'all', noSleep)).toEqual({
      ok: true,
      via: 'already',
      detail: '',
    });
    expect(clicks).toBe(0);
  });

  it('전체가 아니면 드롭다운을 열어 "전체"를 누른다', async () => {
    const doc = setBody(`${tabBar('posts')}<div id="menu-slot"></div>`);
    const dropdown = findFilterDropdown(doc)!;
    dropdown.addEventListener('click', () => {
      doc.querySelector('#menu-slot')!.innerHTML = `
        <div role="menu"><div role="menuitem">전체</div><div role="menuitem">게시물</div></div>`;
      doc.querySelector<HTMLElement>('[role="menuitem"]')!.addEventListener('click', () => {
        // X는 여기서 주소를 /<handle>/all로 바꾸고 탭 줄을 다시 그린다
        doc.querySelector('#menu-slot')!.innerHTML = '';
        dropdown.setAttribute('href', '/gujik_man/all');
      });
    });

    const result = await ensureSweepTab(doc, 'all', noSleep);
    expect(result).toEqual({ ok: true, via: 'menu', detail: '' });
    expect(isOnSweepTab(doc, 'all')).toBe(true);
  });

  it('"전체"를 눌러도 탭이 안 바뀌면 실패로 돌아온다', async () => {
    // 메뉴는 열리는데 주소가 안 바뀌는 경우. 여기서 ok를 주면 게시물 탭을 전체로 착각한다
    const doc = setBody(`${tabBar('posts')}<div id="menu-slot"></div>`);
    findFilterDropdown(doc)!.addEventListener('click', () => {
      doc.querySelector('#menu-slot')!.innerHTML =
        '<div role="menu"><div role="menuitem">전체</div></div>';
    });
    const result = await ensureSweepTab(doc, 'all', noSleep, 0);
    expect(result).toMatchObject({ ok: false, via: 'menu' });
    expect(result.detail).toContain('/gujik_man');
  });

  it('드롭다운이 없으면 탭 줄을 진단에 담아 실패한다', async () => {
    const result = await ensureSweepTab(setBody('<div></div>'), 'all', noSleep, 0);
    expect(result).toMatchObject({ ok: false, via: 'menu' });
    expect(result.detail).toContain('no-tabs');
  });

  it('답글 탭은 앵커를 누른다', async () => {
    const doc = setBody(tabBar('all'));
    const anchor = findTabAnchor(doc, 'with_replies')!;
    let clicked = false;
    anchor.addEventListener('click', () => {
      clicked = true;
      for (const el of doc.querySelectorAll('[role="tab"]'))
        el.setAttribute('aria-selected', String(el === anchor));
    });
    const result = await ensureSweepTab(doc, 'with_replies', noSleep);
    expect(clicked).toBe(true);
    expect(result).toEqual({ ok: true, via: 'anchor', detail: '' });
  });
});

describe('ensureLatestSort', () => {
  it('이미 최신순이면 바꾸지 않는다', async () => {
    const doc = setBody(`${tabBar('all')}<div id="menu-slot"></div>`);
    const dropdown = findFilterDropdown(doc)!;
    dropdown.addEventListener('click', () => {
      doc.querySelector('#menu-slot')!.innerHTML = `
        <div role="menu"><div role="menuitem" id="sort">정렬 기준</div></div>`;
      doc.querySelector<HTMLElement>('#sort')!.addEventListener('click', () => {
        doc.querySelector('[role="menu"]')!.innerHTML += `
          <div role="menuitemradio" aria-checked="true">최신 순서</div>
          <div role="menuitemradio" aria-checked="false">인기</div>`;
      });
    });
    expect(await ensureLatestSort(doc, noSleep)).toMatchObject({ ok: true, changed: false });
  });

  it('"인기"로 돼 있으면 최신 순서를 누른다', async () => {
    const doc = setBody(`${tabBar('all')}<div id="menu-slot"></div>`);
    const dropdown = findFilterDropdown(doc)!;
    let picked = '';
    dropdown.addEventListener('click', () => {
      doc.querySelector('#menu-slot')!.innerHTML = `
        <div role="menu"><div role="menuitem" id="sort">정렬 기준</div></div>`;
      doc.querySelector<HTMLElement>('#sort')!.addEventListener('click', () => {
        doc.querySelector('[role="menu"]')!.innerHTML += `
          <div role="menuitemradio" aria-checked="false">최신 순서</div>
          <div role="menuitemradio" aria-checked="true">인기</div>`;
        for (const r of doc.querySelectorAll('[role="menuitemradio"]')) {
          r.addEventListener('click', () => (picked = r.textContent ?? ''));
        }
      });
    });
    const result = await ensureLatestSort(doc, noSleep);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(picked).toBe('최신 순서');
  });

  it('메뉴를 못 찾으면 실패로 돌아온다 — 던지지 않는다', async () => {
    const doc = setBody(tabBar('all'));
    expect(await ensureLatestSort(doc, noSleep, 0)).toMatchObject({ ok: false, changed: false });
  });
});

describe('closeMenus', () => {
  it('열린 메뉴가 없으면 true', () => {
    expect(closeMenus(setBody(tabBar('all')))).toBe(true);
  });
});
