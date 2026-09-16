// 대시보드가 x.com 작업 탭을 몰아 실행기를 호출한다 (ADR-0004). 브라우저 전용.
import { browser } from 'wxt/browser';
import type { ExecutionResult } from '../core/models';
import type { UiClickConfig } from '../executors/types';
import type { ContentCommand, ContentReply, PageProbe } from '../messaging/protocol';

/** 포커스를 빼앗지 않는 비활성 작업 탭을 만든다 */
export async function createWorkerTab(): Promise<number> {
  const tab = await browser.tabs.create({ url: 'https://x.com/home', active: false });
  if (tab.id === undefined) throw new Error('작업 탭 생성 실패');
  await waitComplete(tab.id);
  return tab.id;
}

export async function navigate(tabId: number, url: string): Promise<void> {
  await browser.tabs.update(tabId, { url });
  await waitComplete(tabId);
}

function waitComplete(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('탭 로딩 시간 초과'));
    }, timeoutMs);
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

export async function probe(tabId: number): Promise<PageProbe> {
  const reply = (await send(tabId, { type: 'PROBE_PAGE' })) as ContentReply;
  if (reply.type !== 'PROBE') throw new Error('예상치 못한 응답');
  return reply.probe;
}

export async function deleteOnTab(
  tabId: number,
  postId: string,
  config: UiClickConfig,
): Promise<ExecutionResult> {
  const reply = (await send(tabId, { type: 'DELETE_POST', postId, config })) as ContentReply;
  if (reply.type !== 'DELETE') throw new Error('예상치 못한 응답');
  return reply.result;
}

function send(tabId: number, cmd: ContentCommand): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, cmd);
}
