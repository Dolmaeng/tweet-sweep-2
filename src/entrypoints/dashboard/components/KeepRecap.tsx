import { keepReasons, type KeepFilter, type Mode } from '../../../core/keep-filter';
import { fmtInt } from '../lib/format';

interface Props {
  mode: Mode;
  filter: KeepFilter;
  /** 아카이브는 목록이 있어 셀 수 있다. 스윕은 null */
  targetCount: number | null;
  /** "예상 약 6일" 같은 한 줄. 없으면 생략 */
  note?: string;
}

/**
 * 시작 직전 되읽기 (docs/spec/04-screens.md §2-4).
 * 무엇을 지우고 무엇을 남기는지 한 번 더 문장으로 말한다. 필터가 비면 "전부"라고 크게 쓴다.
 */
export function KeepRecap({ mode, filter, targetCount, note }: Props) {
  const reasons = keepReasons(filter, mode);
  return (
    <div className={reasons.length === 0 ? 'recap danger' : 'recap'} role="status">
      <p className="recap-line">
        {targetCount === null ? (
          <>
            <b>최신 글부터</b> 지웁니다. 전체 건수는 목록이 없어 미리 알 수 없습니다.
          </>
        ) : (
          <>
            <b>{fmtInt(targetCount)}건</b>을 지웁니다.
          </>
        )}
      </p>
      {reasons.length === 0 ? (
        <p className="recap-line">
          <b>남기는 조건이 없습니다. 전부 지웁니다.</b>
        </p>
      ) : (
        <p className="recap-line">남깁니다: {reasons.join(' · ')}</p>
      )}
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}
