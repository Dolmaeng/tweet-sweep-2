import { useState } from 'react';
import type { PresetName } from '../../../core/models';
import { HARD_MAX_PER_DAY, PRESETS } from '../../../core/pacing';
import { HARD_MIN_FLOOR_SEC, validateRunSettings, type RunSettings } from '../../../core/settings';

interface Props {
  value: RunSettings;
  onSave: (next: RunSettings) => void;
  onBack: () => void;
}

const PRESET_ORDER: PresetName[] = ['cautious', 'normal', 'brisk'];

export function Settings({ value, onSave, onBack }: Props) {
  const [preset, setPreset] = useState<string>(value.preset);
  const [start, setStart] = useState(String(value.activeStartHour));
  const [end, setEnd] = useState(String(value.activeEndHour));
  const [floor, setFloor] = useState(value.floorSec === null ? '' : String(value.floorSec));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  function save() {
    const v = validateRunSettings({
      preset,
      activeStartHour: start,
      activeEndHour: end,
      floorSec: floor,
    });
    if (!v.ok) {
      setErrors(v.errors);
      setSaved(false);
      return;
    }
    setErrors([]);
    setSaved(true);
    onSave(v.value);
  }

  return (
    <section className="card">
      <h2>설정</h2>

      <h3>속도 프리셋(기본값)</h3>
      <select
        aria-label="프리셋"
        value={preset}
        onChange={(e) => {
          setPreset(e.target.value);
          setSaved(false);
        }}
      >
        {PRESET_ORDER.map((p) => (
          <option key={p} value={p}>
            {PRESETS[p].label} ({p}) — 예산 사용률 {Math.round(PRESETS[p].utilization * 100)}%,
            플로어 {PRESETS[p].floorMs / 1000}s
          </option>
        ))}
      </select>

      <h3>활동 시간대</h3>
      <p className="muted small">
        이 시간대 밖에서는 삭제하지 않고 기다립니다. 0~24로 두면 24시간 실행합니다.
      </p>
      <div className="grid2">
        <label>
          시작(시)
          <input
            type="number"
            min={0}
            max={23}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label>
          종료(시)
          <input
            type="number"
            min={1}
            max={24}
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setSaved(false);
            }}
          />
        </label>
      </div>

      <h3>간격 하한(초)</h3>
      <p className="muted small">
        비우면 프리셋 값을 씁니다. 하드 제약 {HARD_MIN_FLOOR_SEC}초 미만은 저장되지 않습니다. 일일
        절대 상한 {HARD_MAX_PER_DAY.toLocaleString('ko-KR')}건은 변경할 수 없습니다.
      </p>
      <label className="block">
        간격 하한
        <input
          type="number"
          min={HARD_MIN_FLOOR_SEC}
          value={floor}
          placeholder="프리셋 값"
          onChange={(e) => {
            setFloor(e.target.value);
            setSaved(false);
          }}
        />
      </label>

      {errors.length > 0 && (
        <ul className="error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {saved && <p className="muted small">저장했습니다.</p>}

      <div className="actions">
        <button className="secondary" onClick={onBack}>
          돌아가기
        </button>
        <button onClick={save}>저장</button>
      </div>
    </section>
  );
}
