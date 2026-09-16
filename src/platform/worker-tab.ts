// 대시보드가 x.com 작업 창을 몰아 실행기를 호출한다 (ADR-0004). 브라우저 전용.
// 작업 탭은 전용 창의 활성 탭이라 백그라운드 스로틀 없이 렌더링된다.
import { browser } from 'wxt/browser';
import type { ExecutionResult } from '../core/models';
import type { UiClickConfig } from '../executors/types';
import type { ContentCommand, ContentReply, PageProbe } from '../messaging/protocol';

export interface Worker {
  windowId: number;
  tabId: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 전용 창에 x.com 작업 탭을 연다 */
export async function openWorker(): Promise<Worker> {
  const win = await browser.windows.create({
    url: 'https://x.com/home',
    focused: true,
    width: 520,
    height: 840,
  });
  const tabId = win?.tabs?.[0]?.id;
  if (win?.id === undefined || tabId === undefined) throw new Error('작업 창 생성 실패');
  await waitComplete(tabId);
  return { windowId: win.id, tabId };
}

/** worker가 없거나 탭이 닫혔으면 다시 연다 */
export async function ensureWorker(worker: Worker | null): Promise<Worker> {
  if (worker && (await isAlive(worker.tabId))) return worker;
  return openWorker();
}

async function isAlive(tabId: number): Promise<boolean> {
  try {
    await browser.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
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

/** 콘텐츠 스크립트가 응답할 때까지 재시도(주입 지연·SPA 렌더 대기 흡수) */
async function send(tabId: number, cmd: ContentCommand, timeoutMs = 15_000): Promise<ContentReply> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const reply = (await browser.tabs.sendMessage(tabId, cmd)) as ContentReply;
      if (reply) return reply;
    } catch {
      // "Receiving end does not exist" — 콘텐츠 스크립트 아직 로드 전
    }
    if (Date.now() >= deadline) throw new Error('작업 탭이 응답하지 않습니다(로그인/로딩 확인)');
    await sleep(400);
  }
}

/** pageKind가 결정될 때까지(tweet/not_found/login/locked) 폴링. 시간 초과면 마지막 값(unknown 포함) */
export async function probeSettled(tabId: number, timeoutMs = 15_000): Promise<PageProbe> {
  const deadline = Date.now() + timeoutMs;
  let last: PageProbe = { pageKind: 'unknown', twid: null };
  for (;;) {
    const reply = await send(tabId, { type: 'PROBE_PAGE' }, Math.max(1000, deadline - Date.now()));
    if (reply.type === 'PROBE') {
      last = reply.probe;
      if (last.pageKind !== 'unknown') return last;
    }
    if (Date.now() >= deadline) return last;
    await sleep(500);
  }
}

export async function deleteOnTab(
  tabId: number,
  postId: string,
  config: UiClickConfig,
): Promise<ExecutionResult> {
  const reply = await send(tabId, { type: 'DELETE_POST', postId, config });
  if (reply.type !== 'DELETE') throw new Error('예상치 못한 응답');
  return reply.result;
}
