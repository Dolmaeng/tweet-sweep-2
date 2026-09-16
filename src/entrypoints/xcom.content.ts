import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { DEFAULT_UI_CONFIG } from '../executors/types';
import { deletePost, detectPageKind, extractTwid, sleepMs } from '../executors/ui-click';
import type { ContentCommand, ContentReply } from '../messaging/protocol';

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
      if (cmd?.type === 'DELETE_POST') {
        return deletePost(
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
