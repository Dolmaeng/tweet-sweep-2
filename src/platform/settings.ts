// 설정·동의 상태. IndexedDB settings 스토어 (FR-14·15).
import { getDb } from './db';
import { coerceRunSettings, type RunSettings } from '../core/settings';
import { coerceKeepFilter, type KeepFilter, type Mode } from '../core/keep-filter';

export const SETTING_CONSENT_AT = 'consentAt';

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const rec = await db.get('settings', key);
  return rec?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key, value });
}

export const SETTING_RUN = 'run';

export async function loadRunSettings(): Promise<RunSettings> {
  return coerceRunSettings(await getSetting<unknown>(SETTING_RUN));
}

export async function saveRunSettings(value: RunSettings): Promise<void> {
  await setSetting(SETTING_RUN, value);
}

/** 모드별로 따로 저장한다. 두 모드가 쓸 수 있는 조건이 달라 한 값을 공유하면 서로 지운다 */
const KEEP_FILTER_KEY: Record<Mode, string> = {
  // 구버전 스윕 필터가 저장돼 있던 키. coerceKeepFilter가 그대로 읽어 옮긴다
  sweep: 'sweepFilter',
  archive: 'archiveFilter',
};

export async function loadKeepFilter(mode: Mode): Promise<KeepFilter> {
  return coerceKeepFilter(await getSetting<unknown>(KEEP_FILTER_KEY[mode]));
}

export async function saveKeepFilter(mode: Mode, value: KeepFilter): Promise<void> {
  await setSetting(KEEP_FILTER_KEY[mode], value);
}
