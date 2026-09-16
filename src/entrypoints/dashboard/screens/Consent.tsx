import { useState } from 'react';

interface Props {
  onAccept: () => void;
}

/** 위험 고지 (헌장 P0, FR-15). 동의 전에는 어떤 기능도 열지 않는다 */
export function Consent({ onAccept }: Props) {
  const [checked, setChecked] = useState(false);
  return (
    <section className="card">
      <h2>시작 전에 읽어주세요</h2>
      <ul>
        <li>
          이 확장은 <b>로그인한 x.com 세션 안에서</b> 사람이 하는 삭제를 대신 수행합니다. X 약관의
          자동화 제한에 저촉될 수 있고, 계정이 <b>일시 잠길 수 있습니다</b>(전화 인증 등).
        </li>
        <li>
          위험을 낮추는 방법은 하나뿐입니다. 사람보다 느리게, 규칙적이지 않게, 차단 신호가 오면 즉시
          멈춥니다. 속도 설정을 올릴수록 위험이 커집니다.
        </li>
        <li>
          모든 데이터는 이 브라우저 안에만 저장됩니다. 서버로 보내지 않습니다. 아카이브에서는
          <code>tweets.js</code>와 <code>account.js</code>만 읽습니다.
        </li>
        <li>삭제는 되돌릴 수 없습니다. 실행 전 계획(dry-run)을 확인하세요.</li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />위
        내용을 이해했고, 결과에 대한 책임이 나에게 있음을 확인합니다.
      </label>
      <div className="actions">
        <button disabled={!checked} onClick={onAccept}>
          계속
        </button>
      </div>
    </section>
  );
}
