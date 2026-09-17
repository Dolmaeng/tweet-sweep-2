import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEYWORDS_MAX, NO_SWEEP_FILTER } from '../../../src/core/sweep-filter';
import { FilterPanel } from '../../../src/entrypoints/dashboard/components/FilterPanel';

describe('FilterPanel', () => {
  afterEach(() => cleanup());

  it('reports the picked mention mode', () => {
    const onChange = vi.fn();
    render(<FilterPanel value={NO_SWEEP_FILTER} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('멘션 제외 (@로 시작하는 트윗 제외)'));
    expect(onChange).toHaveBeenCalledWith({ ...NO_SWEEP_FILTER, mention: 'exclude' });
  });

  it('adds and removes exclude flags without touching the others', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FilterPanel value={NO_SWEEP_FILTER} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('내가 좋아요한 트윗 제외'));
    expect(onChange).toHaveBeenCalledWith({ ...NO_SWEEP_FILTER, exclude: ['liked'] });

    const two = { ...NO_SWEEP_FILTER, exclude: ['liked' as const, 'anyMedia' as const] };
    rerender(<FilterPanel value={two} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('내가 좋아요한 트윗 제외'));
    expect(onChange).toHaveBeenLastCalledWith({ ...two, exclude: ['anyMedia'] });
  });

  it('counts keyword characters and stops at the cap', () => {
    const onChange = vi.fn();
    render(
      <FilterPanel value={{ ...NO_SWEEP_FILTER, keywords: '큐비,트청' }} onChange={onChange} />,
    );
    expect(screen.getByText(`5/${KEYWORDS_MAX}`)).toBeTruthy();
    const input = screen.getByLabelText('제외할 키워드');
    fireEvent.change(input, { target: { value: 'x'.repeat(KEYWORDS_MAX + 20) } });
    expect(onChange).toHaveBeenCalledWith({
      ...NO_SWEEP_FILTER,
      keywords: 'x'.repeat(KEYWORDS_MAX),
    });
  });

  it('resets everything at once', () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        value={{ mention: 'only', exclude: ['liked'], keywords: '큐비' }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '모든 필터 초기화' }));
    expect(onChange).toHaveBeenCalledWith(NO_SWEEP_FILTER);
  });

  it('locks every control while a run is in flight', () => {
    // fieldset 하나로 안의 입력을 모두 잠근다. input.disabled는 이 상속을 반영하지 않으므로
    // 브라우저가 실제로 보는 fieldset을 확인한다
    const { container } = render(
      <FilterPanel value={NO_SWEEP_FILTER} onChange={vi.fn()} disabled />,
    );
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
  });
});
