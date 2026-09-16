import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { parseRateLimit } from '../core/ratelimit';
import { isGraphqlDelete } from '../core/xurl';
import type { NetEvent } from '../messaging/protocol';

// 서비스 워커는 최소 역할만 맡는다(ADR-0004): 대시보드 열기 + 삭제 응답 헤더 관측.
export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void openDashboard();
  });

  // DeleteTweet 응답에서 rate-limit 예산을 읽어 대시보드로 보낸다 (ADR-0007).
  browser.webRequest.onCompleted.addListener(
    (details) => {
      if (!isGraphqlDelete(details.url)) return;
      const at = new Date().toISOString();
      if (details.statusCode === 429) broadcast({ type: 'RATE_LIMIT', at });
      const rl = parseRateLimit(details.responseHeaders ?? []);
      if (rl) broadcast({ type: 'BUDGET', ...rl, at });
    },
    { urls: ['https://x.com/i/api/graphql/*'] },
    ['responseHeaders'],
  );
});

function broadcast(msg: NetEvent): void {
  // 대시보드가 닫혀 있으면 수신자가 없어 reject된다. 무시.
  browser.runtime.sendMessage(msg).catch(() => {});
}

async function openDashboard(): Promise<void> {
  const url = browser.runtime.getURL('/dashboard.html');
  const [existing] = await browser.tabs.query({ url });
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined)
      await browser.windows.update(existing.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url });
}
