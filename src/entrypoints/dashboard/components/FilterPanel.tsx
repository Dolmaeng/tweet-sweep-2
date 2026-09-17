import {
  EXCLUDE_FLAGS,
  EXCLUDE_LABELS,
  KEYWORDS_MAX,
  MENTION_LABELS,
  MENTION_MODES,
  NO_SWEEP_FILTER,
  type ExcludeFlag,
  type SweepFilter,
} from '../../../core/sweep-filter';

interface Props {
  value: SweepFilter;
  onChange: (next: SweepFilter) => void;
  /** 실행 중에는 잠근다. 도중에 조건이 바뀌면 무엇을 지웠는지 설명할 수 없다 */
  disabled?: boolean;
}

/** 스윕 보존 필터 UI (FR-18a) */
export function FilterPanel({ value, onChange, disabled = false }: Props) {
  function toggle(flag: ExcludeFlag, on: boolean) {
    onChange({
      ...value,
      exclude: on ? [...value.exclude, flag] : value.exclude.filter((f) => f !== flag),
    });
  }

  return (
    <fieldset className="filter" disabled={disabled}>
      <legend>트윗 청소기 필터</legend>
      <p className="muted small">
        멘션 필터에서 청소 대상을 선택할 수 있고, 제외 필터로 지우고 싶지 않은 트윗들을 선택할 수
        있어요!
      </p>

      <h3>멘션 필터</h3>
      <p className="muted small">멘션 구분 여부를 선택해주세요!</p>
      {MENTION_MODES.map((mode) => (
        <label className="check" key={mode}>
          <input
            type="radio"
            name="mention"
            checked={value.mention === mode}
            onChange={() => onChange({ ...value, mention: mode })}
          />
          {MENTION_LABELS[mode]}
        </label>
      ))}

      <h3>트윗 제외 필터</h3>
      <p className="muted small">제외할 트윗 유형을 선택해주세요! (다중 선택 가능)</p>
      {EXCLUDE_FLAGS.map((flag) => (
        <label className="check" key={flag}>
          <input
            type="checkbox"
            checked={value.exclude.includes(flag)}
            onChange={(e) => toggle(flag, e.target.checked)}
          />
          {EXCLUDE_LABELS[flag]}
        </label>
      ))}

      <h3>키워드 제외</h3>
      <input
        type="text"
        className="wide"
        maxLength={KEYWORDS_MAX}
        value={value.keywords}
        placeholder="예시: 큐비,트청"
        aria-label="제외할 키워드"
        onChange={(e) => onChange({ ...value, keywords: e.target.value.slice(0, KEYWORDS_MAX) })}
      />
      <p className="muted small hint">
        <span>대소문자 구분 없음, URL 미지원</span>
        <span>
          {value.keywords.length}/{KEYWORDS_MAX}
        </span>
      </p>

      <div className="actions">
        <button className="secondary" onClick={() => onChange(NO_SWEEP_FILTER)}>
          모든 필터 초기화
        </button>
      </div>
    </fieldset>
  );
}
