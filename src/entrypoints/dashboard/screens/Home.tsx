import { useState } from 'react';
import type { AccountRecord } from '../../../platform/db';
import { fmtDate, fmtInt } from '../lib/format';

interface Props {
  accounts: AccountRecord[];
  onImport: () => void;
  onSettings: () => void;
  onSweep: () => void;
  /** 아카이브 기반 삭제. 계정을 골라 들어간다 */
  onArchiveRun: (account: AccountRecord) => void;
  onOpen: (account: AccountRecord) => void;
  onDelete: (account: AccountRecord) => void;
}

/**
 * 삭제 입구는 둘 다 여기 있다 (docs/spec/04-screens.md §3).
 * 예전에는 아카이브 삭제가 `분석` 아래에 숨어 있어, 삭제하러 가는 길인 줄 모르고 들어갔다.
 */
export function Home({
  accounts,
  onImport,
  onSettings,
  onSweep,
  onArchiveRun,
  onOpen,
  onDelete,
}: Props) {
  const [picked, setPicked] = useState('');
  const target = accounts.find((a) => a.userId === picked) ?? accounts[0];

  return (
    <section className="card">
      <h2>계정</h2>
      {accounts.length === 0 ? (
        <p className="muted">가져온 아카이브가 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>계정</th>
              <th>전체</th>
              <th>대상(원글+답글)</th>
              <th>가져온 날</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const s = a.summary;
              return (
                <tr key={a.userId}>
                  <td>@{a.username}</td>
                  <td>{s ? fmtInt(s.total) : '-'}</td>
                  <td>{s ? fmtInt(s.byKind.post + s.byKind.reply) : '-'}</td>
                  <td>{fmtDate(a.importedAt)}</td>
                  <td className="row-actions">
                    <button className="secondary" onClick={() => onOpen(a)}>
                      분석
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (
                          confirm(
                            `@${a.username}의 로컬 데이터를 지울까요? (X의 게시물은 건드리지 않습니다)`,
                          )
                        ) {
                          onDelete(a);
                        }
                      }}
                    >
                      로컬 삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3>지우기</h3>
      <div className="modes">
        <div className="mode">
          <div className="mode-head">
            <button
              className="danger"
              disabled={!target}
              onClick={() => target && onArchiveRun(target)}
            >
              아카이브로 삭제
            </button>
            {accounts.length > 1 && (
              <select
                aria-label="삭제할 계정"
                value={target?.userId ?? ''}
                onChange={(e) => setPicked(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    @{a.username}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="muted small">
            {accounts.length === 0
              ? '먼저 아카이브를 가져오세요.'
              : '가져온 zip의 목록대로. 대상 건수·기간·글 ID 지정이 됩니다.'}
          </p>
        </div>

        <div className="mode">
          <div className="mode-head">
            <button className="danger" onClick={onSweep}>
              아카이브 없이 삭제
            </button>
          </div>
          <p className="muted small">
            로그인한 계정의 타임라인을 최신 글부터. 목록은 없지만 내가 좋아요·북마크한 글, 내가 올린
            미디어를 남길 수 있습니다.
          </p>
        </div>
      </div>

      <div className="actions">
        <button onClick={onImport}>아카이브 가져오기</button>
        <button className="secondary" onClick={onSettings}>
          설정
        </button>
      </div>
    </section>
  );
}
