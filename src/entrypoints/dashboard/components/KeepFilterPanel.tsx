import {
  KEEP_FLAGS,
  KEEP_LABELS,
  KEYWORDS_MAX,
  MENTION_LABELS,
  MENTION_MODES,
  NO_KEEP_FILTER,
  fieldReason,
  flagReason,
  isValidRegex,
  type KeepField,
  type KeepFilter,
  type KeepFlag,
  type Mode,
} from '../../../core/keep-filter';
import type { PostKind } from '../../../core/models';

interface Props {
  mode: Mode;
  value: KeepFilter;
  onChange: (next: KeepFilter) => void;
  /** 실행 중에는 잠근다. 도중에 조건이 바뀌면 무엇을 지웠는지 설명할 수 없다 */
  disabled?: boolean;
}

/** 잠긴 항목은 숨기지 않는다. 안 보이면 "체크 안 함"과 구별되지 않는다 (docs/spec/04-screens.md §1-3) */
function Locked({ label, reason }: { label: string; reason: string }) {
  return (
    <p className="check locked">
      <span className="lock" aria-hidden="true">
        🔒
      </span>
      {label} <span className="muted small">— {reason}</span>
    </p>
  );
}

/**
 * 보존 필터 UI (FR-04 + FR-18a, ADR-0012). 두 모드가 같은 컴포넌트를 쓰고,
 * 모드가 판정하지 못하는 항목만 잠긴 줄로 바뀐다.
 */
export function KeepFilterPanel({ mode, value, onChange, disabled = false }: Props) {
  function set<K extends keyof KeepFilter>(key: K, v: KeepFilter[K]) {
    onChange({ ...value, [key]: v });
  }

  function toggleFlag(flag: KeepFlag, on: boolean) {
    set('keep', on ? [...value.keep, flag] : value.keep.filter((f) => f !== flag));
  }

  function toggleKind(kind: PostKind, on: boolean) {
    set('kinds', on ? [...value.kinds, kind] : value.kinds.filter((k) => k !== kind));
  }

  /** 쓸 수 있으면 render(), 아니면 잠긴 줄 */
  function field(name: KeepField, label: string, render: () => React.ReactNode) {
    const reason = fieldReason(mode, name);
    return reason === null ? render() : <Locked label={label} reason={reason} />;
  }

  const regexOk = value.includeRegex === '' || isValidRegex(value.includeRegex);

  return (
    <fieldset className="filter" disabled={disabled}>
      <legend>보존 필터</legend>
      <p className="muted small">
        위에서 지울 범위를 고르고, 아래에서 <b>남길 글</b>을 고릅니다. 이 모드가 판정할 수 없는
        조건은 🔒로 두고 이유를 적었습니다.
      </p>

      <h3>무엇을 지울까</h3>
      {MENTION_MODES.map((m) => (
        <label className="check" key={m}>
          <input
            type="radio"
            name={`mention-${mode}`}
            checked={value.mention === m}
            onChange={() => set('mention', m)}
          />
          {MENTION_LABELS[m]}
        </label>
      ))}

      {field('kinds', '원글 / 답글 나눠 고르기', () => (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={value.kinds.includes('post')}
              onChange={(e) => toggleKind('post', e.target.checked)}
            />
            원글
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={value.kinds.includes('reply')}
              onChange={(e) => toggleKind('reply', e.target.checked)}
            />
            답글
          </label>
          <p className="muted small">리포스트는 어느 모드에서도 지우지 않습니다.</p>
        </>
      ))}

      {field('dateRange', '기간 지정', () => (
        <div className="grid2">
          <label>
            기간 시작
            <input type="date" value={value.from} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label>
            기간 끝
            <input type="date" value={value.to} onChange={(e) => set('to', e.target.value)} />
          </label>
        </div>
      ))}

      {field('includeKeyword', '이 말이 들어간 글만', () => (
        <label className="block">
          이 말이 들어간 글만 지우기
          <input
            type="text"
            maxLength={KEYWORDS_MAX}
            value={value.includeKeyword}
            placeholder="선택"
            onChange={(e) => set('includeKeyword', e.target.value)}
          />
        </label>
      ))}

      <h3>지우지 않을 글</h3>
      <p className="muted small">체크한 조건에 걸리는 글은 남깁니다. (다중 선택)</p>
      {KEEP_FLAGS.map((flag) => {
        const reason = flagReason(mode, flag);
        return reason === null ? (
          <label className="check" key={flag}>
            <input
              type="checkbox"
              checked={value.keep.includes(flag)}
              onChange={(e) => toggleFlag(flag, e.target.checked)}
            />
            {KEEP_LABELS[flag]}
          </label>
        ) : (
          <Locked key={flag} label={KEEP_LABELS[flag]} reason={reason} />
        );
      })}

      {field('keepMinLikes', '좋아요 N개 이상 남기기', () => (
        <div className="grid2">
          <label>
            좋아요 N개 이상 남기기
            <input
              type="number"
              min={1}
              value={value.keepMinLikes}
              placeholder="선택"
              onChange={(e) => set('keepMinLikes', e.target.value)}
            />
          </label>
          <label>
            리포스트 N개 이상 남기기
            <input
              type="number"
              min={1}
              value={value.keepMinRetweets}
              placeholder="선택"
              onChange={(e) => set('keepMinRetweets', e.target.value)}
            />
          </label>
        </div>
      ))}

      {field('keepIds', '지정한 글 ID 남기기', () => (
        <label className="block">
          남길 글 ID (고정글 등, 쉼표로 구분)
          <input
            type="text"
            value={value.keepIds}
            placeholder="선택"
            onChange={(e) => set('keepIds', e.target.value)}
          />
        </label>
      ))}

      <h3>키워드</h3>
      <input
        type="text"
        className="wide"
        maxLength={KEYWORDS_MAX}
        value={value.excludeKeywords}
        placeholder="예시: 큐비,트청"
        aria-label="남길 키워드"
        onChange={(e) => set('excludeKeywords', e.target.value.slice(0, KEYWORDS_MAX))}
      />
      <p className="muted small hint">
        <span>이 말이 들어간 글은 남깁니다. 대소문자 구분 없음, URL 미지원</span>
        <span>
          {value.excludeKeywords.length}/{KEYWORDS_MAX}
        </span>
      </p>

      {field('includeRegex', '정규식으로 대상 좁히기', () => (
        <>
          <label className="block">
            정규식으로 대상 좁히기 (이 식에 맞는 글만 지움)
            <input
              type="text"
              maxLength={KEYWORDS_MAX}
              value={value.includeRegex}
              placeholder="선택"
              onChange={(e) => set('includeRegex', e.target.value)}
            />
          </label>
          {!regexOk && <p className="error">정규식이 올바르지 않습니다. 대상이 0건이 됩니다.</p>}
        </>
      ))}

      <div className="actions">
        <button className="secondary" onClick={() => onChange(NO_KEEP_FILTER)}>
          모든 필터 초기화
        </button>
      </div>
    </fieldset>
  );
}
