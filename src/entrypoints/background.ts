import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { isPacedOperation } from '../core/budget-buckets';
import { parseRateLimit } from '../core/ratelimit';
import { graphqlOperation } from '../core/xurl';
import type { NetEvent } from '../messaging/protocol';

// 서비스 워커는 최소 역할만 맡는다(ADR-0004): 대시보드 열기 + 삭제 응답 헤더 관측.
export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void openDashboard();
  });

  // 삭제 경로 GraphQL 응답에서 rate-limit 예산을 읽어 대시보드로 보낸다 (ADR-0007, ADR-0014).
  // 삭제만 보면 안 된다: 글을 한 건 지우려면 그 페이지를 한 번 읽어야 하고,
  // 읽기 버킷이 먼저 바닥나면 "Something went wrong" 화면이 뜬다(page:unknown).
  // 반대로 삭제와 무관한 연산까지 보면 그쪽 버킷이 삭제를 세운다 — 그래서 걸러낸다(ADR-0015).
  browser.webRequest.onCompleted.addListener(
    (details) => {
      const op = graphqlOperation(details.url);
      if (op === null || !isPacedOperation(op)) return;
      const at = new Date().toISOString();
      if (details.statusCode === 429) broadcast({ type: 'RATE_LIMIT', op, at });
      const rl = parseRateLimit(details.responseHeaders ?? []);
      if (rl) broadcast({ type: 'BUDGET', op, ...rl, at });
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
