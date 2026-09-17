import { useEffect, useMemo, useState } from 'react';
import type { DeleteOrder, Job, PostKind, PresetName } from '../../../core/models';
import { ORDER_LABELS } from '../../../core/order';
import { selectTargets, type FilterSpec } from '../../../core/filters';
import { PRESETS, PRESET_ORDER, estimate } from '../../../core/pacing';
import type { AccountRecord } from '../../../platform/db';
import { createJob, listPosts } from '../../../platform/db';
import { fmtDays, fmtInt } from '../lib/format';

interface Props {
  account: AccountRecord;
  defaultPreset?: PresetName;
  onPlanned: (job: Job) => void;
  onBack: () => void;
}

const DELETE_ORDERS: DeleteOrder[] = ['newest', 'oldest'];

export function PlanRun({ account, defaultPreset = 'brisk', onPlanned, onBack }: Props) {
  const [posts, setPosts] = useState<
    | {
        id: string;
        kind: PostKind;
        createdAt: string;
        text: string;
        likeCount: number;
        retweetCount: number;
      }[]
    | null
  >(null);
  const [includePosts, setIncludePosts] = useState(true);
  const [includeReplies, setIncludeReplies] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [keepMinLikes, setKeepMinLikes] = useState('');
  const [keepIds, setKeepIds] = useState('');
  const [preset, setPreset] = useState<PresetName>(defaultPreset);
  const [order, setOrder] = useState<DeleteOrder>('newest');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void listPosts(account.userId).then((rows) =>
      setPosts(
        rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          createdAt: r.createdAt,
          text: r.text,
          likeCount: r.likeCount,
          retweetCount: r.retweetCount,
        })),
      ),
    );
  }, [account.userId]);

  const spec: FilterSpec = useMemo(() => {
    const kinds: PostKind[] = [];
    if (includePosts) kinds.push('post');
    if (includeReplies) kinds.push('reply');
    const s: FilterSpec = { kinds };
    if (from) s.from = new Date(from).toISOString();
    if (to) s.to = new Date(to + 'T23:59:59').toISOString();
    if (keyword.trim()) s.keyword = keyword.trim();
    const likes = Number(keepMinLikes);
    if (keepMinLikes && Number.isFinite(likes)) s.keepMinLikes = likes;
    const ids = keepIds
      .split(/[\s,]+/)
      .map((x) => x.replace(/\D/g, ''))
      .filter(Boolean);
    if (ids.length) s.keepIds = ids;
    return s;
  }, [includePosts, includeReplies, from, to, keyword, keepMinLikes, keepIds]);

  const targets = useMemo(() => (posts ? selectTargets(posts as never, spec) : []), [posts, spec]);
  const est = estimate(targets.length, PRESETS[preset]);

  async function makePlan() {
    setCreating(true);
    const job: Job = {
      id: `job-${Date.now()}`,
      userId: account.userId,
      filterSpec: spec,
      preset,
      order,
      createdAt: new Date().toISOString(),
      status: 'planned',
      targetCount: targets.length,
      removedCount: 0,
    };
    await createJob(
      job,
      targets.map((t) => t.id),
    );
    onPlanned(job);
  }

  return (
    <section className="card">
      <h2>삭제 계획 — @{account.username}</h2>
      {posts === null ? (
        <p className="muted">글 불러오는 중…</p>
      ) : (
        <>
          <h3>대상 조건</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={includePosts}
              onChange={(e) => setIncludePosts(e.target.checked)}
            />
            원글
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={includeReplies}
              onChange={(e) => setIncludeReplies(e.target.checked)}
            />
            답글
          </label>
          <p className="muted small">리포스트는 v1에서 제외됩니다.</p>

          <div className="grid2">
            <label>
              기간 시작
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              기간 끝
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label>
              키워드 포함
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="선택"
              />
            </label>
            <label>
              이 좋아요 이상 보존
              <input
                type="number"
                value={keepMinLikes}
                onChange={(e) => setKeepMinLikes(e.target.value)}
                placeholder="선택"
              />
            </label>
          </div>
          <label className="block">
            보존할 글 ID(고정글 등, 쉼표로 구분)
            <input
              type="text"
              value={keepIds}
              onChange={(e) => setKeepIds(e.target.value)}
              placeholder="선택"
            />
          </label>

          <h3>삭제 순서</h3>
          <select
            aria-label="삭제 순서"
            value={order}
            onChange={(e) => setOrder(e.target.value as DeleteOrder)}
          >
            {DELETE_ORDERS.map((o) => (
              <option key={o} value={o}>
                {ORDER_LABELS[o]}
              </option>
            ))}
          </select>

          <h3>속도</h3>
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetName)}>
            {PRESET_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRESETS[p].label} ({p})
              </option>
            ))}
          </select>

          <p className="target">
            삭제 대상 <b>{fmtInt(targets.length)}</b>건 · 예상 {fmtDays(est.days)} (하루 최대{' '}
            {fmtInt(est.perDay)}건, 실제 한도로 조정됨)
          </p>
          <p className="muted small">
            안전을 위해 첫날은 워밍업으로 50건 정도만 지우고, 이상 없으면 속도가 올라갑니다.
          </p>

          <div className="actions">
            <button className="secondary" onClick={onBack} disabled={creating}>
              돌아가기
            </button>
            <button onClick={() => void makePlan()} disabled={creating || targets.length === 0}>
              계획 만들기 ({fmtInt(targets.length)}건)
            </button>
          </div>
        </>
      )}
    </section>
  );
}
