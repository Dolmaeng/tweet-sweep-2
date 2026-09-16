// 설정·동의 상태. IndexedDB settings 스토어 (FR-14·15).
import { getDb } from './db';
import { coerceRunSettings, type RunSettings } from '../core/settings';

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
