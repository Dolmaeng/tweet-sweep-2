import { useEffect, useState } from 'react';
import type { ExecutionResult } from '../../../core/models';
import { DEFAULT_UI_CONFIG } from '../../../executors/types';
import { profileUrl, statusUrl } from '../../../core/xurl';
import type { AccountRecord } from '../../../platform/db';
import { createWorkerTab, deleteOnTab, navigate, probe } from '../../../platform/worker-tab';
import type { NetEvent, PageProbe } from '../../../messaging/protocol';
import { browser } from 'wxt/browser';

interface Props {
  account: AccountRecord;
  onBack: () => void;
}

// M2 스파이크 화면: 세션 일치 확인 → 글 미리보기(dry-run) → 한 건 삭제(라이브, 사용자 확인).
export function TestRun({ account, onBack }: Props) {
  const [tabId, setTabId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [probeResult, setProbeResult] = useState<PageProbe | null>(null);
  const [postId, setPostId] = useState('');
  const [confirmLive, setConfirmLive] = useState(false);
  const [deleteResult, setDeleteResult] = useState<ExecutionResult | null>(null);
  const [budget, setBudget] = useState<NetEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const listener = (msg: unknown) => {
      const ev = msg as NetEvent;
      if (ev?.type === 'BUDGET' || ev?.type === 'RATE_LIMIT') setBudget(ev);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const twidMatches = probeResult?.twid === account.userId;

  async function guard<T>(fn: () => Promise<T>) {
    setError(null);
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function ensureTab(): Promise<number> {
    if (tabId !== null) return tabId;
    const id = await createWorkerTab();
    setTabId(id);
    return id;
  }

  async function checkSession() {
    await guard(async () => {
      const id = await ensureTab();
      await navigate(id, profileUrl(account.username));
      await sleep(1500);
      setProbeResult(await probe(id));
    });
  }

  async function preview() {
    if (!postId.trim()) return;
    await guard(async () => {
      const id = await ensureTab();
      await navigate(id, statusUrl(account.username, postId.trim()));
      await sleep(1500);
      setProbeResult(await probe(id));
      setDeleteResult(null);
    });
  }

  async function runDelete() {
    if (!postId.trim() || !confirmLive) return;
    if (!confirm(`글 ${postId} 을(를) 실제로 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
    await guard(async () => {
      const id = await ensureTab();
      await navigate(id, statusUrl(account.username, postId.trim()));
      await sleep(1500);
      setDeleteResult(await deleteOnTab(id, postId.trim(), DEFAULT_UI_CONFIG));
    });
  }

  return (
    <section className="card">
      <h2>삭제 테스트 (M2) — @{account.username}</h2>
      <p className="muted small">
        라이브 대량 삭제는 아직 없습니다. 이 화면은 세션 일치와 한 건 삭제 경로만 확인합니다.
      </p>

      <h3>1. 세션 확인</h3>
      <div className="actions">
        <button onClick={() => void checkSession()} disabled={busy}>
          작업 탭 열고 세션 확인
        </button>
      </div>
      {probeResult && (
        <p className="small">
          페이지: <b>{probeResult.pageKind}</b> · 세션 twid: {probeResult.twid ?? '없음'} ·{' '}
          {twidMatches ? (
            <span style={{ color: 'var(--accent)' }}>아카이브 계정과 일치</span>
          ) : (
            <span className="error">불일치 — 이 계정으로 로그인했는지 확인</span>
          )}
        </p>
      )}

      <h3>2. 글 한 건</h3>
      <input
        type="text"
        placeholder="테스트용 글 ID (예: 1849...) 또는 글 URL 끝의 숫자"
        value={postId}
        onChange={(e) => setPostId(e.target.value.replace(/\D/g, ''))}
        style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box' }}
      />
      <div className="actions">
        <button className="secondary" onClick={() => void preview()} disabled={busy || !postId}>
          미리보기 (삭제 안 함)
        </button>
      </div>

      <h3>3. 삭제 실행 (라이브)</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={confirmLive}
          disabled={!twidMatches}
          onChange={(e) => setConfirmLive(e.target.checked)}
        />
        이 글을 실제로 삭제하는 데 동의합니다 (되돌릴 수 없음)
      </label>
      <div className="actions">
        <button
          className="danger"
          onClick={() => void runDelete()}
          disabled={busy || !postId || !confirmLive || !twidMatches}
        >
          삭제 실행
        </button>
      </div>
      {deleteResult && (
        <p className={deleteResult.kind === 'ok' ? '' : 'error'}>
          결과: <b>{deleteResult.kind}</b>
          {'signal' in deleteResult && deleteResult.signal ? ` (${deleteResult.signal})` : ''}
          {'detail' in deleteResult && deleteResult.detail ? ` — ${deleteResult.detail}` : ''}
        </p>
      )}

      {budget && (
        <p className="muted small">
          최근 네트워크:{' '}
          {budget.type === 'BUDGET'
            ? `한도 ${budget.limit}, 잔여 ${budget.remaining}, 리셋 ${budget.resetSec}s`
            : `429 (${budget.at.slice(11, 19)})`}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button className="secondary" onClick={onBack} disabled={busy}>
          돌아가기
        </button>
      </div>
    </section>
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
