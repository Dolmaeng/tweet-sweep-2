// 프로필 타임라인 탭 선택 (ADR-0016). DOM만 읽고 탭·메뉴만 누른다. 글은 건드리지 않는다.
//
// 2026-09-23 라이브 확인(x.com/gujik_man, ko):
//   프로필 탭 줄은 [role="tab"] 앵커 4개다.
//     · /<handle> 또는 /<handle>/all — 맨 왼쪽. aria-haspopup="menu"로 드롭다운을 연다
//     · /<handle>/with_replies (답글) · /reposts (재게시) · /media (미디어)
//   드롭다운 항목은 href 없는 div[role="menuitem"]: 전체 · 게시물 · 하이라이트 · 정렬 기준.
//   "전체"를 고르면 주소가 /<handle>/all이 되고, 그 주소로 직접 들어가도 전체가 선택된다.
//   "정렬 기준"은 하위 메뉴 [role="menuitemradio"] 둘: "최신 순서"(기본 체크) · "인기".
//
// 그래서 평소에는 URL 한 번이면 끝난다. 아래 누르는 경로는 X가 그 주소를 안 받아줄 때의 대비다.
import { sleepMs, waitFor } from './ui-click';
import type { SweepTab } from '../core/xurl';

/** 드롭다운의 "전체" 항목. 언어별 라벨 */
export const ALL_MENU_LABELS = ['전체', 'All'];

/** 드롭다운의 "정렬 기준" 항목 */
export const SORT_MENU_LABELS = ['정렬 기준', 'Sort by', 'Sort'];

/** 정렬 하위 메뉴의 "최신 순서". "인기"를 고르면 최신부터 지울 수 없다 */
export const LATEST_SORT_LABELS = ['최신', 'Latest', 'Most recent', 'Recent'];

function labelOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** 정확히 일치를 먼저 보고, 없으면 접두사. "전체"가 "전체 보기" 같은 항목을 잘못 집지 않게 */
function matches(el: Element, labels: string[]): boolean {
  const text = labelOf(el);
  return labels.some((l) => text === l) || labels.some((l) => text.startsWith(l));
}

export function selectedTabHref(doc: Document): string | null {
  return doc.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('href') ?? null;
}

/** 진단용. 탭 줄이 통째로 바뀌었는지 사람이 바로 알아볼 수 있게 */
export function tabHrefs(doc: Document): string {
  return (
    Array.from(doc.querySelectorAll('[role="tab"]'))
      .map((el) => el.getAttribute('href') ?? '?')
      .join(' | ') || 'no-tabs'
  );
}

const TAB_SUFFIX: Record<SweepTab, RegExp> = {
  all: /\/all$/,
  with_replies: /\/with_replies$/,
};

/** 지금 선택된 탭이 그 탭인가 */
export function isOnSweepTab(doc: Document, tab: SweepTab): boolean {
  const href = selectedTabHref(doc);
  return href !== null && TAB_SUFFIX[tab].test(href);
}

/** 탭 줄에서 그 탭의 앵커. 답글·재게시·미디어는 평범한 링크다 */
export function findTabAnchor(doc: Document, tab: SweepTab): HTMLElement | null {
  const tabs = Array.from(doc.querySelectorAll<HTMLElement>('[role="tab"]'));
  return tabs.find((el) => TAB_SUFFIX[tab].test(el.getAttribute('href') ?? '')) ?? null;
}

/** 전체·게시물·하이라이트·정렬을 품은 맨 왼쪽 드롭다운 */
export function findFilterDropdown(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('[role="tab"][aria-haspopup="menu"]');
}

export function findMenuItem(doc: Document, labels: string[]): HTMLElement | null {
  const items = Array.from(doc.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  return items.find((el) => matches(el, labels)) ?? null;
}

export interface SortRadio {
  el: HTMLElement;
  label: string;
  checked: boolean;
}

export function findSortRadios(doc: Document): SortRadio[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).map((el) => ({
    el,
    label: labelOf(el),
    checked: el.getAttribute('aria-checked') === 'true',
  }));
}

/**
 * 열린 메뉴를 닫는다. **합성 Escape 이벤트는 X가 무시한다**(2026-09-23 확인) —
 * #layers를 덮은 전면 배경을 눌러야 닫힌다. 메뉴를 열어 둔 채 두면 스크롤도 카드 클릭도 막힌다.
 */
export function closeMenus(doc: Document): boolean {
  if (doc.querySelectorAll('[role="menu"]').length === 0) return true;
  const view = doc.defaultView;
  const w = view?.innerWidth ?? 0;
  const h = view?.innerHeight ?? 0;
  const backdrop = Array.from(doc.querySelectorAll<HTMLElement>('#layers div')).find(
    (d) => d.getAttribute('role') === null && d.offsetWidth >= w * 0.8 && d.offsetHeight >= h * 0.8,
  );
  backdrop?.click();
  return doc.querySelectorAll('[role="menu"]').length === 0;
}

export interface TabResult {
  ok: boolean;
  /** 어떻게 맞췄는지. 진단과 기록용 */
  via: 'already' | 'anchor' | 'menu';
  /** 실패 사유·관측한 탭 줄 */
  detail: string;
}

/**
 * 그 탭이 선택된 상태로 만든다. 이미 맞으면 아무것도 누르지 않는다.
 * 실패해도 예외를 던지지 않는다 — 호출자가 주소를 보고 계속할지 정한다.
 */
export async function ensureSweepTab(
  doc: Document,
  tab: SweepTab,
  sleep: (ms: number) => Promise<void> = sleepMs,
  timeoutMs = 8_000,
): Promise<TabResult> {
  if (isOnSweepTab(doc, tab)) return { ok: true, via: 'already', detail: '' };

  if (tab === 'with_replies') {
    const anchor = findTabAnchor(doc, tab);
    if (!anchor) return { ok: false, via: 'anchor', detail: `tabs[${tabHrefs(doc)}]` };
    anchor.click();
  } else {
    // 전체는 탭 줄에 앵커가 없다. 드롭다운을 열어 "전체"를 눌러야 한다
    const dropdown = findFilterDropdown(doc);
    if (!dropdown) return { ok: false, via: 'menu', detail: `tabs[${tabHrefs(doc)}]` };
    dropdown.click();
    const item = await waitFor(() => findMenuItem(doc, ALL_MENU_LABELS), timeoutMs, sleep);
    if (!item) {
      closeMenus(doc);
      return { ok: false, via: 'menu', detail: `menu[${menuText(doc)}]` };
    }
    item.click();
  }

  const settled = await waitFor(() => (isOnSweepTab(doc, tab) ? true : null), timeoutMs, sleep);
  const via = tab === 'with_replies' ? 'anchor' : 'menu';
  return settled === true
    ? { ok: true, via, detail: '' }
    : { ok: false, via, detail: `selected[${selectedTabHref(doc) ?? '?'}]` };
}

function menuText(doc: Document): string {
  return (
    Array.from(doc.querySelectorAll('[role="menuitem"]'))
      .map((el) => labelOf(el).slice(0, 12) || '?')
      .join(' | ') || 'empty'
  );
}

export interface SortResult {
  ok: boolean;
  /** 실제로 바꿨는가. 이미 최신순이면 false */
  changed: boolean;
  detail: string;
}

/**
 * 정렬을 "최신 순서"로 맞춘다. "인기"로 두면 타임라인이 시간순이 아니라 최신부터 지울 수 없다.
 *
 * 실행마다 한 번만 부른다. 메뉴를 여닫는 동작이라 삭제 루프 안에서 반복하면 사고가 는다.
 * 어느 단계에서 실패하든 메뉴를 닫고 ok=false로 돌아온다 — 정렬은 맞추면 좋은 것이지
 * 못 맞췄다고 실행을 막을 일이 아니다.
 */
export async function ensureLatestSort(
  doc: Document,
  sleep: (ms: number) => Promise<void> = sleepMs,
  timeoutMs = 8_000,
): Promise<SortResult> {
  const dropdown = findFilterDropdown(doc);
  if (!dropdown) return { ok: false, changed: false, detail: `tabs[${tabHrefs(doc)}]` };
  dropdown.click();

  const sortItem = await waitFor(() => findMenuItem(doc, SORT_MENU_LABELS), timeoutMs, sleep);
  if (!sortItem) {
    closeMenus(doc);
    return { ok: false, changed: false, detail: `menu[${menuText(doc)}]` };
  }
  sortItem.click();

  const radios = await waitFor(
    () => {
      const found = findSortRadios(doc);
      return found.length > 0 ? found : null;
    },
    timeoutMs,
    sleep,
  );
  if (!radios) {
    closeMenus(doc);
    return { ok: false, changed: false, detail: 'no-radios' };
  }

  const latest = radios.find((r) => LATEST_SORT_LABELS.some((l) => r.label.startsWith(l)));
  if (!latest) {
    closeMenus(doc);
    return { ok: false, changed: false, detail: `sort[${radios.map((r) => r.label).join('|')}]` };
  }
  if (latest.checked) {
    closeMenus(doc);
    return { ok: true, changed: false, detail: latest.label };
  }

  latest.el.click();
  await sleep(600);
  closeMenus(doc);
  return { ok: true, changed: true, detail: latest.label };
}
