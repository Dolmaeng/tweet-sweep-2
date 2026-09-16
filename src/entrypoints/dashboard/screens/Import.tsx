import { useRef, useState } from 'react';
import { importArchive, type ImportPhase, type ImportResult } from '../../../platform/import';
import { fmtInt } from '../lib/format';

interface Props {
  onDone: (result: ImportResult) => void;
  onCancel: () => void;
}

export function Import({ onDone, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<ImportPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(files: File[]) {
    setError(null);
    try {
      const result = await importArchive(files, setPhase);
      onDone(result);
    } catch (e) {
      setError((e as Error).message);
      setPhase(null);
    }
  }

  return (
    <section className="card">
      <h2>아카이브 가져오기</h2>
      <p>
        X 설정 → 계정 → <b>데이터 아카이브 다운로드</b>로 받은 zip 파일을 고르세요. zip이 너무 크면
        압축을 풀고 <code>data/tweets.js</code>(part 파일 포함)와 <code>data/account.js</code>를
        함께 고르셔도 됩니다.
      </p>
      <p className="muted">
        읽는 파일: tweets*.js, account.js. DM·미디어 등 다른 항목은 열지 않습니다. 파일은 브라우저
        밖으로 나가지 않습니다.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".zip,.js"
        disabled={phase !== null}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void run(files);
        }}
      />
      {phase && <Progress phase={phase} />}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="secondary" onClick={onCancel} disabled={phase !== null}>
          돌아가기
        </button>
      </div>
    </section>
  );
}

function Progress({ phase }: { phase: ImportPhase }) {
  switch (phase.phase) {
    case 'reading':
      return <p>파일 읽는 중…</p>;
    case 'parsing':
      return <p>파싱 중: {phase.file}</p>;
    case 'saving':
      return (
        <p>
          저장 중: {fmtInt(phase.done)} / {fmtInt(phase.total)}
        </p>
      );
  }
}
