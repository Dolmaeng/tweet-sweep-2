// 아카이브 가져오기 파이프라인: 파일 → 텍스트 → 파싱 → 요약 → 저장 (FR-01, FR-05).
import {
  ArchiveFormatError,
  mergeParts,
  parseAccountText,
  parseTweetsText,
  summarize,
} from '../core/archive/parse';
import type { ArchiveSummary } from '../core/models';
import { readArchiveFiles } from './archive-input';
import { putAccount, putPosts, type AccountRecord } from './db';

export type ImportPhase =
  | { phase: 'reading' }
  | { phase: 'parsing'; file: string }
  | { phase: 'saving'; done: number; total: number };

export interface ImportResult {
  account: AccountRecord;
  summary: ArchiveSummary;
  skippedEntries: number;
}

export async function importArchive(
  files: File[],
  onProgress: (p: ImportPhase) => void,
): Promise<ImportResult> {
  onProgress({ phase: 'reading' });
  const texts = await readArchiveFiles(files);
  if (!texts.account) {
    throw new ArchiveFormatError(
      'account.js를 찾지 못했습니다. 아카이브 zip 전체 또는 data/account.js를 함께 선택하세요.',
    );
  }
  if (texts.tweets.length === 0) {
    throw new ArchiveFormatError(
      'tweets.js를 찾지 못했습니다. data/tweets.js(및 part 파일)를 선택하세요.',
    );
  }
  const account = parseAccountText(texts.account.text);
  const parts = [];
  for (const f of texts.tweets) {
    onProgress({ phase: 'parsing', file: f.name });
    parts.push({ name: f.name, posts: parseTweetsText(f.text) });
  }
  const posts = mergeParts(parts);
  const summary = summarize(posts, account);
  const record: AccountRecord = {
    userId: account.userId,
    username: account.username,
    archiveLatestPostAt: summary.latestAt,
    importedAt: new Date().toISOString(),
    summary,
  };
  onProgress({ phase: 'saving', done: 0, total: posts.length });
  await putPosts(account.userId, posts, (done) =>
    onProgress({ phase: 'saving', done, total: posts.length }),
  );
  await putAccount(record);
  return { account: record, summary, skippedEntries: texts.skipped };
}
