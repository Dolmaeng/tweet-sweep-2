import type { ExecutionResult } from '../../../core/models';

export interface FeedLine {
  at: number;
  postId: string;
  /** 삭제 직전에 확보한 본문. 미디어만 있는 글은 빈 문자열 */
  text: string;
  result: ExecutionResult;
}

export const FEED_CAP = 300;

/** 실시간 기록 (FR-11a). 무엇이 지워졌는지 알 수 있도록 본문을 함께 보여준다 */
export function Feed({ lines }: { lines: FeedLine[] }) {
  if (lines.length === 0) return <p className="muted small">아직 없음</p>;
  return (
    <ul className="feed">
      {lines.map((l) => (
        <li
          key={`${l.postId}-${l.at}`}
          className={l.result.kind === 'ok' || l.result.kind === 'gone' ? 'ok' : 'bad'}
        >
          <div className="body">{l.text || <span className="muted">(본문 없음)</span>}</div>
          <div className="meta">
            <span className="mono">{new Date(l.at).toLocaleTimeString()}</span>{' '}
            <span className="mono">{l.postId}</span> → {l.result.kind}
            {'detail' in l.result && l.result.detail ? ` (${l.result.detail})` : ''}
          </div>
        </li>
      ))}
    </ul>
  );
}
