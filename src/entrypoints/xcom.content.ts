import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { DEFAULT_UI_CONFIG } from '../executors/types';
import {
  deletePost,
  detectPageKind,
  extractTwid,
  sleepMs,
  undoRepost,
} from '../executors/ui-click';
import { readSessionUsername, scanTimeline } from '../executors/timeline-scan';
import { ensureLatestSort, ensureSweepTab, isOnSweepTab } from '../executors/profile-tabs';
import type { ContentCommand, ContentReply, TabState } from '../messaging/protocol';
import type { SweepTab } from '../core/xurl';

// x.com 페이지에서 대시보드의 명령을 수행한다. 페이지가 스스로 요청을 만들게 하여 사람과 구별되지 않게 한다.
export default defineContentScript({
  matches: ['https://x.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown): Promise<ContentReply> | undefined => {
      const cmd = message as ContentCommand;
      if (cmd?.type === 'PROBE_PAGE') {
        return Promise.resolve({
          type: 'PROBE',
          probe: {
            pageKind: detectPageKind(document, location.pathname),
            twid: extractTwid(document.cookie),
          },
        });
      }
      if (cmd?.type === 'SESSION_INFO') {
        return Promise.resolve({ type: 'SESSION', username: readSessionUsername(document) });
      }
      if (cmd?.type === 'SCAN_TIMELINE') {
        return Promise.resolve({ type: 'SCAN', items: scanTimeline(document) });
      }
      if (cmd?.type === 'ENSURE_TAB') {
        return ensureTab(cmd.tab, cmd.sort).then((tab) => ({ type: 'TAB', tab }) as const);
      }
      if (cmd?.type === 'SCROLL') {
        // 사람처럼 한 화면씩. 'more'는 아래로 내려 다음 묶음을 불러온다
        window.scrollTo({
          top: cmd.to === 'top' ? 0 : window.scrollY + window.innerHeight * 0.9,
          behavior: 'smooth',
        });
        return sleepMs(1200).then(() => ({ type: 'SCROLLED' }) as const);
      }
      if (cmd?.type === 'DELETE_POST') {
        return deletePost(
          document,
          location.pathname,
          cmd.postId,
          cmd.config ?? DEFAULT_UI_CONFIG,
          sleepMs,
        ).then((result) => ({ type: 'DELETE', result }));
      }
      if (cmd?.type === 'UNDO_REPOST') {
        return undoRepost(
          document,
          location.pathname,
          cmd.postId,
          cmd.config ?? DEFAULT_UI_CONFIG,
          sleepMs,
        ).then((result) => ({ type: 'DELETE', result }));
      }
      return undefined;
    });
  },
});

/**
 * 프로필 타임라인 탭을 맞춘다 (ADR-0016). 주소로 들어와 이미 맞는 것이 정상 경로이고,
 * 아니면 탭 줄·드롭다운을 눌러 맞춘다. 정렬은 실행당 한 번만 손댄다.
 */
async function ensureTab(tab: SweepTab, sort: boolean): Promise<TabState> {
  const result = await ensureSweepTab(document, tab, sleepMs);
  // 정렬은 전체 탭에서만 의미가 있다. 답글 탭에는 드롭다운이 없다
  let sortChanged = false;
  let sortDetail = '';
  if (sort && tab === 'all' && isOnSweepTab(document, tab)) {
    const s = await ensureLatestSort(document, sleepMs);
    sortChanged = s.changed;
    sortDetail = s.ok ? '' : ` sort:${s.detail}`;
  }
  return {
    ok: result.ok,
    path: location.pathname,
    sortChanged,
    detail: `${result.via}${result.detail ? ` ${result.detail}` : ''}${sortDetail}`,
  };
}
