import { useEffect, useRef, useState } from 'react';
import type { ExecutionResult, Job } from '../../../core/models';
import type { AccountRecord } from '../../../platform/db';
import { getJob } from '../../../platform/db';
import { runJob, type RunControls, type RunEvent } from '../../../platform/runner';
import { useBudget } from '../lib/budget';
import { fmtInt } from '../lib/format';

interface Props {
  account: AccountRecord;
  job: Job;
  onBack: () => void;
}

interface FeedLine {
  at: number;
  postId: string;
  result: ExecutionResult;
}

const FEED_CAP = 300;

export function LiveRun({ account, job, onBack }: Props) {
  const { view, source } = useBudget();
  const [running, setRunning] = useState(false);
  const [removed, setRemoved] = useState(job.removedCount);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [status, setStatus] = useState<string>('대기 중');
  const [ended, setEnded] = useState<string | null>(null);

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
      { job, username: account.username, activeStartHour: 9, activeEndHour: 23 },
      controls,
      source,
      onEvent,
    );
  }

  function onEvent(ev: RunEvent) {
    switch (ev.type) {
      case 'running':
        setStatus('삭제 중');
        break;
      case 'item':
        setRemoved(ev.removedCount);
        setStatus('삭제 중');
        setFeed((f) =>
          [{ at: ev.at, postId: ev.postId, result: ev.result }, ...f].slice(0, FEED_CAP),
        );
        break;
      case 'waiting':
        setStatus(`대기: ${ev.reason}`);
        break;
      case 'ended':
        setRunning(false);
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
      <p className="muted small">상태: {status}</p>

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
