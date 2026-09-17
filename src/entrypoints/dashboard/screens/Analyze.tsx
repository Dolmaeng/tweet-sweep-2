import type { ArchiveSummary } from '../../../core/models';
import { DEFAULT_BUDGET, PRESETS, PRESET_ORDER, estimate } from '../../../core/pacing';
import { downloadText, fmtDate, fmtDays, fmtInt, toCsv } from '../lib/format';

interface Props {
  summary: ArchiveSummary;
  importedAt: string;
  onBack: () => void;
  onTestRun: () => void;
  onRun: () => void;
}

/** analyze 보고서 (FR-05). v1 대상 = 원글 + 답글 (RT 제외, SRS §2) */
export function Analyze({ summary, importedAt, onBack, onTestRun, onRun }: Props) {
  const target = summary.byKind.post + summary.byKind.reply;
  const years = Object.keys(summary.byYear).sort();

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['metric', 'value'],
      ['username', summary.account.username],
      ['userId', summary.account.userId],
      ['total', summary.total],
      ['posts', summary.byKind.post],
      ['replies', summary.byKind.reply],
      ['retweets', summary.byKind.retweet],
      ['withMedia', summary.withMedia],
      ['earliest', summary.earliestAt ?? ''],
      ['latest', summary.latestAt ?? ''],
      ['target_v1(posts+replies)', target],
      [],
      ['year', 'count'],
      ...years.map((y) => [y, summary.byYear[y] ?? 0]),
    ];
    downloadText(`tweet-sweep-analyze-${summary.account.username}.csv`, toCsv(rows));
  }

  return (
    <section className="card">
      <h2>
        분석: @{summary.account.username}{' '}
        <span className="muted small">(id {summary.account.userId})</span>
      </h2>
      <p className="muted small">
        가져온 시각 {importedAt.slice(0, 16).replace('T', ' ')} · 아카이브 범위{' '}
        {fmtDate(summary.earliestAt)} ~ {fmtDate(summary.latestAt)}
      </p>

      <table>
        <tbody>
          <tr>
            <th>전체</th>
            <td>{fmtInt(summary.total)}</td>
          </tr>
          <tr>
            <th>원글</th>
            <td>{fmtInt(summary.byKind.post)}</td>
          </tr>
          <tr>
            <th>답글</th>
            <td>{fmtInt(summary.byKind.reply)}</td>
          </tr>
          <tr>
            <th>리포스트</th>
            <td>
              {fmtInt(summary.byKind.retweet)} <span className="muted small">(v1 제외)</span>
            </td>
          </tr>
          <tr>
            <th>미디어 포함</th>
            <td>{fmtInt(summary.withMedia)}</td>
          </tr>
          <tr>
            <th>
              <b>삭제 대상(원글+답글)</b>
            </th>
            <td>
              <b>{fmtInt(target)}</b>
            </td>
          </tr>
        </tbody>
      </table>

      <h3>속도별 예상 소요</h3>
      <p className="muted small">
        가정: 한도 {DEFAULT_BUDGET.limit}건/{DEFAULT_BUDGET.windowSec / 60}분(헤더 관측 전), 하루
        14시간 활동. 실제 값은 첫 삭제 응답의 헤더로 갱신됩니다.
      </p>
      <table>
        <thead>
          <tr>
            <th>프리셋</th>
            <th>예산 사용률</th>
            <th>간격</th>
            <th>하루</th>
            <th>소요</th>
          </tr>
        </thead>
        <tbody>
          {PRESET_ORDER.map((name) => {
            const spec = PRESETS[name];
            const e = estimate(target, spec);
            return (
              <tr key={name}>
                <td>
                  {spec.label} <span className="muted small">({name})</span>
                </td>
                <td>{Math.round(spec.utilization * 100)}%</td>
                <td>약 {e.intervalSec}s</td>
                <td>≤{fmtInt(e.perDay)}</td>
                <td>{fmtDays(e.days)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>연도별</h3>
      <table>
        <thead>
          <tr>
            <th>연도</th>
            <th>건수</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <td>{y}</td>
              <td>{fmtInt(summary.byYear[y] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="actions">
        <button className="secondary" onClick={onBack}>
          계정 목록
        </button>
        <button onClick={exportCsv}>CSV 내보내기</button>
        <button className="secondary" onClick={onTestRun}>
          삭제 테스트
        </button>
        <button className="danger" onClick={onRun}>
          이 아카이브로 삭제 →
        </button>
      </div>
    </section>
  );
}
