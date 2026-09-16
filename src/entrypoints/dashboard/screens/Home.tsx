import type { AccountRecord } from '../../../platform/db';
import { fmtDate, fmtInt } from '../lib/format';

interface Props {
  accounts: AccountRecord[];
  onImport: () => void;
  onSettings: () => void;
  onOpen: (account: AccountRecord) => void;
  onDelete: (account: AccountRecord) => void;
}

export function Home({ accounts, onImport, onSettings, onOpen, onDelete }: Props) {
  return (
    <section className="card">
      <h2>계정</h2>
      {accounts.length === 0 ? (
        <p className="muted">가져온 아카이브가 없습니다. 먼저 아카이브를 가져오세요.</p>
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
      <div className="actions">
        <button onClick={onImport}>아카이브 가져오기</button>
        <button className="secondary" onClick={onSettings}>
          설정
        </button>
      </div>
    </section>
  );
}
