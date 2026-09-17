import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEEP_LABELS, NO_KEEP_FILTER } from '../../../src/core/keep-filter';
import { KeepFilterPanel } from '../../../src/entrypoints/dashboard/components/KeepFilterPanel';

const noop = () => {};

afterEach(() => cleanup());

describe('KeepFilterPanel', () => {
  it('스윕 모드는 8개 보존 조건을 모두 체크할 수 있다', () => {
    render(<KeepFilterPanel mode="sweep" value={NO_KEEP_FILTER} onChange={noop} />);
    for (const label of Object.values(KEEP_LABELS)) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('아카이브 모드에서 못 쓰는 조건은 사라지지 않고 이유와 함께 잠긴다', () => {
    render(<KeepFilterPanel mode="archive" value={NO_KEEP_FILTER} onChange={noop} />);
    // 체크박스는 없지만
    expect(screen.queryByLabelText(KEEP_LABELS.liked)).toBeNull();
    // 항목 자체와 이유는 화면에 남는다 — 안 보이면 "체크 안 함"과 구별되지 않는다
    const row = screen.getByText(KEEP_LABELS.liked, { exact: false });
    expect(row.textContent).toContain('like.js');
  });

  it('아카이브 모드는 미디어 보존을 체크할 수 있다 (사고가 났던 그 조건)', () => {
    const onChange = vi.fn();
    render(<KeepFilterPanel mode="archive" value={NO_KEEP_FILTER} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(KEEP_LABELS.anyMedia));
    expect(onChange).toHaveBeenCalledWith({ ...NO_KEEP_FILTER, keep: ['anyMedia'] });
  });

  it('스윕 모드는 기간·정확한 수치 칸을 잠그고 이유를 적는다', () => {
    render(<KeepFilterPanel mode="sweep" value={NO_KEEP_FILTER} onChange={noop} />);
    expect(screen.queryByLabelText('기간 시작')).toBeNull();
    expect(screen.getByText(/기간 지정/).textContent).toContain('기간을 지정할 수 없습니다');
    expect(screen.getByText(/좋아요 N개 이상 남기기/).textContent).toContain(
      '정확한 수를 읽지 못합니다',
    );
  });

  it('실행 중에는 fieldset이 잠긴다', () => {
    const { container } = render(
      <KeepFilterPanel mode="sweep" value={NO_KEEP_FILTER} onChange={noop} disabled />,
    );
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
  });
});
