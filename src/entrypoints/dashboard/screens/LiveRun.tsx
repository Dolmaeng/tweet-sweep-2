import { useEffect, useRef, useState } from 'react';
import type { ExecutionResult, Job } from '../../../core/models';
import { ORDER_LABELS, coerceOrder } from '../../../core/order';
import type { AccountRecord } from '../../../platform/db';
import { getJob } from '../../../platform/db';
import { runJob, type RunControls, type RunEvent } from '../../../platform/runner';
import type { RunSettings } from '../../../core/settings';
import { useBudget } from '../lib/budget';
import { fmtInt } from '../lib/format';

interface Props {
  account: AccountRecord;
  job: Job;
  settings: RunSettings;
  onBack: () => void;
}

interface FeedLine {
  at: number;
  postId: string;
  result: ExecutionResult;
}

const FEED_CAP = 300;

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export function LiveRun({ account, job, settings, onBack }: Props) {
  const { view, source } = useBudget();
  const [running, setRunning] = useState(false);
  const [removed, setRemoved] = useState(job.removedCount);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [status, setStatus] = useState<string>('대기 중');
  const [ended, setEnded] = useState<string | null>(null);
  /** 스케줄러 대기(활동 시간대 밖·예산 소진 등). 페이싱 수면과 구분해 크게 표시 */
  const [waiting, setWaiting] = useState<{ reason: string; untilMs: number } | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);

  const order = coerceOrder(job.order);
  const paused = useRef(false);
  const stopped = useRef(false);
  const target = job.targetCount;

  // 재개 시 최신 removedCount 반영
  useEffect(() => {
    void getJob(job.id).then((j) => {
      if (j) setRemoved(j.removedCount);
    });
  }, [job.id]);

  function start() {
    if (running) return;
    if (
      !confirm(
        `@${account.username}의 글 ${fmtInt(target)}건을 삭제하기 시작합니다.\n계정 안전을 위해 천천히 진행되며, 언제든 멈출 수 있습니다. 계속할까요?`,
      )
    )
      return;
    paused.current = false;
    stopped.current = false;
    setEnded(null);
    setRunning(true);
    const controls: RunControls = {
      isPaused: () => paused.current,
      isStopped: () => stopped.current,
    };
    void runJob(
      {
        job,
        username: account.username,
        activeStartHour: settings.activeStartHour,
        activeEndHour: settings.activeEndHour,
        ...(settings.floorSec !== null ? { floorMs: settings.floorSec * 1000 } : {}),
      },
      controls,
      source,
      onEvent,
    );
  }

  function onEvent(ev: RunEvent) {
    switch (ev.type) {
      case 'running':
        setStatus('삭제 중');
        setWaiting(null);
        break;
      case 'item':
        setRemoved(ev.removedCount);
        setStatus('삭제 중');
        setWaiting(null);
        setFeed((f) =>
          [{ at: ev.at, postId: ev.postId, result: ev.result }, ...f].slice(0, FEED_CAP),
        );
        break;
      case 'waiting':
        setStatus(`대기: ${ev.reason}`);
        setWaiting({ reason: ev.reason, untilMs: ev.untilMs });
        setNextAt(null);
        break;
      case 'sleeping':
        setNextAt(ev.untilMs);
        break;
      case 'ended':
        setRunning(false);
        setWaiting(null);
        setNextAt(null);
        setEnded(ev.reason);
        setStatus(ev.completed ? '완료' : `중단: ${ev.reason}`);
        break;
    }
  }

  const pct = target === 0 ? 0 : Math.min(100, Math.round((removed / target) * 100));

  return (
    <section className="card">
      <h2>삭제 실행 — @{account.username}</h2>

      <p className="counter">
        deleted <b>{fmtInt(removed)}</b> of {fmtInt(target)} tweets
      </p>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        순서: {ORDER_LABELS[order]} · 상태: {status}
        {nextAt !== null && !waiting ? ` · 다음 삭제 ${fmtClock(nextAt)}` : ''}
      </p>
      {waiting && (
        <div className="notice" role="status">
          <b>지금은 삭제하지 않고 기다리는 중입니다.</b> 이유: {waiting.reason}. 재개 예정{' '}
          {fmtClock(waiting.untilMs)}
          {waiting.reason === '활동 시간대 밖'
            ? ` (활동 시간대 ${settings.activeStartHour}~${settings.activeEndHour}시, 설정에서 변경 가능)`
            : ''}
        </div>
      )}

      <div className="actions">
        {!running ? (
          <button onClick={start} disabled={ended === '완료'}>
            {removed > 0 ? '이어서 삭제' : '삭제 시작'}
          </button>
        ) : (
          <>
            <button
              className="secondary"
              onClick={() => {
                paused.current = !paused.current;
                setStatus(paused.current ? '일시정지' : '삭제 중');
              }}
            >
              일시정지/재개
            </button>
            <button className="danger" onClick={() => (stopped.current = true)}>
              중지
            </button>
          </>
        )}
        <button className="secondary" onClick={onBack} disabled={running}>
          돌아가기
        </button>
      </div>

      <p className="muted small">
        {view.remaining != null
          ? `X 예산: 한도 ${view.limit}, 잔여 ${view.remaining}${view.resetSec != null ? `, 리셋 ${view.resetSec}s` : ''}`
          : `X 예산 미관측(가정 한도 ${view.limit}). 첫 삭제 후 실측값으로 갱신됩니다`}
      </p>

      <h3>실시간 기록</h3>
      {feed.length === 0 ? (
        <p className="muted small">아직 없음</p>
      ) : (
        <ul className="feed">
          {feed.map((l) => (
            <li
              key={`${l.postId}-${l.at}`}
              className={l.result.kind === 'ok' || l.result.kind === 'gone' ? 'ok' : 'bad'}
            >
              <span className="mono">{new Date(l.at).toLocaleTimeString()}</span> {l.postId} →{' '}
              {l.result.kind}
              {'detail' in l.result && l.result.detail ? ` (${l.result.detail})` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
