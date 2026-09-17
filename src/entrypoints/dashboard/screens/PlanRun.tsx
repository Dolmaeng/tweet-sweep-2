import { useEffect, useMemo, useState } from 'react';
import type { DeleteOrder, Job, PresetName } from '../../../core/models';
import { ORDER_LABELS } from '../../../core/order';
import {
  NO_KEEP_FILTER,
  selectTargets,
  type KeepFilter,
  type TargetPost,
} from '../../../core/keep-filter';
import { PRESETS, PRESET_ORDER, estimate, withCustomInterval } from '../../../core/pacing';
import type { AccountRecord } from '../../../platform/db';
import { createJob, listPosts } from '../../../platform/db';
import { loadKeepFilter, saveKeepFilter } from '../../../platform/settings';
import { KeepFilterPanel } from '../components/KeepFilterPanel';
import { KeepRecap } from '../components/KeepRecap';
import { fmtDays, fmtInt } from '../lib/format';

interface Props {
  account: AccountRecord;
  defaultPreset?: PresetName;
  /** 사용자 지정 간격(초). 예상 소요를 이 값으로 센다 */
  intervalSec?: number | null;
  onPlanned: (job: Job) => void;
  onBack: () => void;
}

const DELETE_ORDERS: DeleteOrder[] = ['newest', 'oldest'];

export function PlanRun({
  account,
  defaultPreset = 'brisk',
  intervalSec = null,
  onPlanned,
  onBack,
}: Props) {
  const [posts, setPosts] = useState<TargetPost[] | null>(null);
  const [filter, setFilter] = useState<KeepFilter>(NO_KEEP_FILTER);
  /** 저장해 둔 필터를 실제로 읽어왔는가. 읽기 전/실패는 "필터 없음"과 구별해야 한다 */
  const [filterLoaded, setFilterLoaded] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
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
          inReplyToId: r.inReplyToId,
          hasMedia: r.hasMedia,
          likeCount: r.likeCount,
          retweetCount: r.retweetCount,
        })),
      ),
    );
  }, [account.userId]);

  // 읽기에 실패하면 조용히 NO_KEEP_FILTER로 두면 안 된다. 그 상태로 계획을 만들면 사용자가
  // 체크해 둔 보존 조건(미디어 제외 등)이 없는 채로 전부 대상이 된다 — 되돌릴 수 없는 사고다.
  useEffect(() => {
    void loadKeepFilter('archive')
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
    void saveKeepFilter('archive', next).catch((e: Error) => setFilterError(e.message));
  }

  const targets = useMemo(() => (posts ? selectTargets(posts, filter) : []), [posts, filter]);
  // 사용자 지정 간격이 있으면 예상 소요도 그 값으로 센다. 프리셋으로 세면 화면이 거짓말을 한다
  const est = estimate(targets.length, withCustomInterval(PRESETS[preset], intervalSec));

  async function makePlan() {
    if (!filterLoaded) return;
    setCreating(true);
    const job: Job = {
      id: `job-${Date.now()}`,
      userId: account.userId,
      filterSpec: filter,
      preset,
      order,
      mode: 'archive',
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
      <h2>삭제 계획 — 아카이브 모드 · @{account.username}</h2>
      <div className="notice">
        <b>아카이브 모드</b>입니다. 가져온 zip의 목록대로 지웁니다. 아카이브에 없는 정보(내가
        좋아요·북마크한 글 여부, 아카이브 생성 이후에 쓴 글)로는 거를 수 없습니다. 그 조건이
        필요하면 홈의 <b>아카이브 없이 삭제</b>를 쓰세요.
      </div>
      {posts === null ? (
        <p className="muted">글 불러오는 중…</p>
      ) : (
        <>
          <KeepFilterPanel mode="archive" value={filter} onChange={changeFilter} />

          {filterError !== null ? (
            <p className="error">
              저장해 둔 필터를 읽지 못했습니다({filterError}). 위에서 보존 조건을 다시 선택해야
              계획을 만들 수 있습니다.
            </p>
          ) : (
            !filterLoaded && <p className="muted small">저장해 둔 필터 불러오는 중…</p>
          )}

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

          {filterLoaded && (
            <KeepRecap
              mode="archive"
              filter={filter}
              targetCount={targets.length}
              note={`예상 ${fmtDays(est.days)} (하루 최대 ${fmtInt(est.perDay)}건, 실제 한도로 조정됨). 안전을 위해 첫날은 워밍업으로 50건 정도만 지우고, 이상 없으면 속도가 올라갑니다.`}
            />
          )}

          <div className="actions">
            <button className="secondary" onClick={onBack} disabled={creating}>
              돌아가기
            </button>
            <button
              onClick={() => void makePlan()}
              disabled={creating || !filterLoaded || targets.length === 0}
            >
              계획 만들기 ({fmtInt(targets.length)}건)
            </button>
          </div>
        </>
      )}
    </section>
  );
}
