import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';

// 서비스 워커는 최소 역할만 맡는다(ADR-0004): 대시보드 열기, 메시지 중계.
export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void openDashboard();
  });
});

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
