// 사용자가 고른 파일(zip 또는 data/*.js)에서 필요한 텍스트만 꺼낸다. 브라우저 전용 (plan §6, P2).
// zip.js 선택 이유: ZIP64·임의 접근 지원 → 수 GB 아카이브에서 미디어를 읽지 않고 두 항목만 추출.
import { BlobReader, TextWriter, ZipReader, configure } from '@zip.js/zip.js';
import { isAccountFile, isTweetsFile } from '../core/archive/parse';

// 확장 페이지 CSP(script-src 'self')에서 blob 워커가 막힐 수 있어 메인 스레드에서 inflate한다.
configure({ useWebWorkers: false });

export interface ArchiveTextFile {
  name: string;
  text: string;
}

export interface ArchiveTexts {
  tweets: ArchiveTextFile[];
  account: ArchiveTextFile | null;
  /** 읽지 않은 항목 수(미디어 등). 정보 표시용 */
  skipped: number;
}

export async function readArchiveFiles(files: File[]): Promise<ArchiveTexts> {
  const out: ArchiveTexts = { tweets: [], account: null, skipped: 0 };
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      await readZip(file, out);
    } else if (isTweetsFile(file.name)) {
      out.tweets.push({ name: file.name, text: await file.text() });
    } else if (isAccountFile(file.name)) {
      out.account = { name: file.name, text: await file.text() };
    } else {
      out.skipped += 1;
    }
  }
  return out;
}

async function readZip(file: File, out: ArchiveTexts): Promise<void> {
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    for (const entry of entries) {
      if (entry.directory || !entry.getData) {
        out.skipped += 1;
        continue;
      }
      if (isTweetsFile(entry.filename)) {
        out.tweets.push({ name: entry.filename, text: await entry.getData(new TextWriter()) });
      } else if (isAccountFile(entry.filename)) {
        out.account = { name: entry.filename, text: await entry.getData(new TextWriter()) };
      } else {
        out.skipped += 1;
      }
    }
  } finally {
    await reader.close();
  }
}
