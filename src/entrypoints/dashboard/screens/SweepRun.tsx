import { useEffect, useRef, useState } from 'react';
import type { Job } from '../../../core/models';
import type { RunSettings } from '../../../core/settings';
import { isFilterActive, NO_KEEP_FILTER, type KeepFilter } from '../../../core/keep-filter';
import { createSweepJob, getResumableJob } from '../../../platform/db';
import { loadKeepFilter, saveKeepFilter } from '../../../platform/settings';
import { runSweep, type SweepEvent } from '../../../platform/sweep';
import type { RunControls } from '../../../platform/runner';
import { Feed, FEED_CAP, type FeedLine } from '../components/Feed';
import { KeepFilterPanel } from '../components/KeepFilterPanel';
import { KeepRecap } from '../components/KeepRecap';
import {
  ensureWorker,
  navigate,
  probeSettled,
  sessionUsername,
} from '../../../platform/worker-tab';
import { profileUrl } from '../../../core/xurl';
import { useBudget } from '../lib/budget';
import { fmtInt } from '../lib/format';

interface Props {
  settings: RunSettings;
  onBack: () => void;
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** 로그인된 계정 handle을 읽는다. 실패하면 throw */
async function detectSessionUsername(): Promise<string> {
  const worker = await ensureWorker(null);
  await navigate(worker.tabId, profileUrl('home'));
  const probe = await probeSettled(worker.tabId);
  if (probe.pageKind === 'login') throw new Error('x.com에 로그인되어 있지 않습니다');
  const who = await sessionUsername(worker.tabId);
  if (!who) throw new Error('로그인 계정을 읽지 못했습니다. x.com 화면을 확인하세요');
  return who;
}

/** 세션 handle과 이어서 할 작업을 함께 읽는다(상태 변경 없음) */
async function loadSession(): Promise<{ who: string; prior: Job | undefined }> {
  const who = await detectSessionUsername();
  return { who, prior: await getResumableJob(who.toLowerCase(), 'sweep') };
}

function makeSweepJob(userId: string, settings: RunSettings, filter: KeepFilter): Job {
  return {
    id: `sweep-${Date.now()}`,
    userId,
    filterSpec: filter,
    preset: settings.preset,
    order: 'newest',
    mode: 'sweep',
    createdAt: new Date().toISOString(),
    status: 'planned',
    targetCount: 0,
    removedCount: 0,
  };
}

export function SweepRun({ settings, onBack }: Props) {
  const { view, source } = useBudget();
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  /** 재확인 버튼이 올리는 값. 효과를 다시 돌린다 */
  const [checkNonce, setCheckNonce] = useState(0);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [filter, setFilter] = useState<KeepFilter>(NO_KEEP_FILTER);
  /** 저장해 둔 필터를 실제로 읽어왔는가. 읽기 전/실패는 "필터 없음"과 구별해야 한다 */
  const [filterLoaded, setFilterLoaded] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [deleted, setDeleted] = useState(0);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [status, setStatus] = useState('대기 중');
  const [waiting, setWaiting] = useState<{ reason: string; untilMs: number } | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [ended, setEnded] = useState<string | null>(null);

  const paused = useRef(false);
  const stopped = useRef(false);

  // 세션 계정 확인: 사용자가 입력하지 않고 로그인된 계정을 읽어온다 (ADR-0009)
  useEffect(() => {
    let cancelled = false;
    void loadSession()
      .then((r) => {
        if (cancelled) return;
        setUsername(r.who);
        setCheckError(null);
        if (r.prior) setDeleted(r.prior.removedCount);
      })
      .catch((e: Error) => {
        if (!cancelled) setCheckError(e.message);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkNonce]);

  // 읽기에 실패하면 조용히 NO_KEEP_FILTER로 두면 안 된다. 그 상태로 시작하면 사용자가
  // 체크해 둔 보존 조건(미디어 제외 등)이 없는 채로 전부 지워진다 — 되돌릴 수 없는 사고다.
  useEffect(() => {
    void loadKeepFilter('sweep')
      .then((f) => {
        setFilter(f);
        setFilterLoaded(true);
      })
      .catch((e: Error) => setFilterError(e.message));
  }, []);

  function changeFilter(next: KeepFilter) {
    setFilter(next);
    // 사용자가 직접 고른 값이면 저장값을 못 읽었더라도 그 값으로 시작해도 된다
    setFilterLoaded(true);
    setFilterError(null);
    void saveKeepFilter('sweep', next).catch((e: Error) => setFilterError(e.message));
  }

  async function start() {
    if (running || !username || !filterLoaded) return;
    const userId = username.toLowerCase();
    const prior = await getResumableJob(userId, 'sweep');
    // 이어서 할 때도 지금 화면의 필터를 쓴다. 작업 기록도 그 값으로 맞춘다
    const job = prior ? { ...prior, filterSpec: filter } : makeSweepJob(userId, settings, filter);
    await createSweepJob(job);
    setDeleted(job.removedCount);
    paused.current = false;
    stopped.current = false;
    setEnded(null);
    setRunning(true);
    const controls: RunControls = {
      isPaused: () => paused.current,
      isStopped: () => stopped.current,
    };
    void runSweep(
      {
        job,
        username,
        filter,
        activeStartHour: settings.activeStartHour,
        activeEndHour: settings.activeEndHour,
        intervalSec: settings.floorSec,
      },
      controls,
      source,
      onEvent,
    );
  }

  function onEvent(ev: SweepEvent) {
    switch (ev.type) {
      case 'running':
        setStatus('삭제 중');
        setWaiting(null);
        break;
      case 'item':
        setDeleted(ev.deleted);
        setStatus('삭제 중');
        setWaiting(null);
        setFeed((f) =>
          [{ at: ev.at, postId: ev.postId, text: ev.text, result: ev.result }, ...f].slice(
            0,
            FEED_CAP,
          ),
        );
        break;
      case 'searching':
        setStatus(ev.note);
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

  const confirmed =
    username !== null && typed.replace(/^@/, '').toLowerCase() === username.toLowerCase();

  return (
    <section className="card">
      <h2>아카이브 없이 삭제 — 스윕 모드</h2>

      <div className="notice">
        <b>되돌릴 수 없습니다.</b> 이 모드는 목록도 미리보기도 없이, 로그인한 계정의 원글과 답글을
        최신 글부터 {isFilterActive(filter, 'sweep') ? '필터에 걸리지 않는 것만' : '전부'} 지웁니다.
        리포스트는 건드리지 않고, 고정한 글은 맨 마지막에 지웁니다.
      </div>

      {checkError && (
        <p className="error">
          {checkError}{' '}
          <button
            className="secondary"
            onClick={() => {
              setChecking(true);
              setCheckError(null);
              setCheckNonce((n) => n + 1);
            }}
          >
            다시 확인
          </button>
        </p>
      )}

      {username === null ? (
        <p className="muted">{checking ? '로그인 계정 확인 중…' : '계정을 확인하지 못했습니다'}</p>
      ) : (
        <>
          <p className="target">
            대상 계정 <b>@{username}</b> <span className="muted small">(로그인 세션에서 읽음)</span>
          </p>

          <p className="counter">
            deleted <b>{fmtInt(deleted)}</b> tweets
          </p>
          <p className="muted small">
            순서: 최신 글부터 · 상태: {status}
            {nextAt !== null && !waiting ? ` · 다음 삭제 ${fmtClock(nextAt)}` : ''}
          </p>
          <p className="muted small">전체 건수는 목록이 없어 미리 알 수 없습니다.</p>

          {waiting && (
            <div className="notice" role="status">
              <b>지금은 삭제하지 않고 기다리는 중입니다.</b> 이유: {waiting.reason}. 재개 예정{' '}
              {fmtClock(waiting.untilMs)}
              {waiting.reason === '활동 시간대 밖'
                ? ` (활동 시간대 ${settings.activeStartHour}~${settings.activeEndHour}시, 설정에서 변경 가능)`
                : ''}
            </div>
          )}

          <KeepFilterPanel mode="sweep" value={filter} onChange={changeFilter} disabled={running} />

          {filterError !== null ? (
            <p className="error">
              저장해 둔 필터를 읽지 못했습니다({filterError}). 위에서 보존 조건을 다시 선택해야
              시작할 수 있습니다.
            </p>
          ) : (
            !filterLoaded && <p className="muted small">저장해 둔 필터 불러오는 중…</p>
          )}

          {!running && filterLoaded && (
            <KeepRecap mode="sweep" filter={filter} targetCount={null} />
          )}

          {!running && (
            <label className="block">
              시작하려면 계정 이름 <code>{username}</code> 을 그대로 입력하세요
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={username}
                aria-label="계정 이름 확인"
              />
            </label>
          )}

          <div className="actions">
            {!running ? (
              <button
                onClick={() => void start()}
                disabled={!confirmed || !filterLoaded || ended === '완료'}
              >
                {deleted > 0
                  ? '이어서 삭제'
                  : isFilterActive(filter, 'sweep')
                    ? '삭제 시작'
                    : '전부 삭제 시작'}
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
          <Feed lines={feed} />
        </>
      )}
    </section>
  );
}
