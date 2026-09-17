import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUN_SETTINGS } from '../../../src/core/settings';
import { Settings } from '../../../src/entrypoints/dashboard/screens/Settings';

describe('Settings screen', () => {
  afterEach(() => cleanup());

  it('refuses to save a floor below the hard minimum', () => {
    const onSave = vi.fn();
    render(<Settings value={DEFAULT_RUN_SETTINGS} onSave={onSave} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('간격 하한'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('listitem').textContent).toContain('하드 제약');
  });

  it('saves a widened active window', () => {
    const onSave = vi.fn();
    render(<Settings value={DEFAULT_RUN_SETTINGS} onSave={onSave} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('시작(시)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('종료(시)'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onSave).toHaveBeenCalledWith({
      ...DEFAULT_RUN_SETTINGS,
      activeStartHour: 0,
      activeEndHour: 24,
    });
  });
});
