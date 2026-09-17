import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUN_SETTINGS } from '../../../src/core/settings';
import { Settings } from '../../../src/entrypoints/dashboard/screens/Settings';

describe('Settings screen', () => {
  afterEach(() => cleanup());

  it('0 이하 간격은 저장하지 않고 오류를 띄운다', () => {
    const onSave = vi.fn();
    render(<Settings value={DEFAULT_RUN_SETTINGS} onSave={onSave} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('삭제 간격'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('listitem').textContent).toContain('0보다 커야 합니다');
  });

  it('0.3을 넣으면 0.3초로 저장한다', () => {
    const onSave = vi.fn();
    render(<Settings value={DEFAULT_RUN_SETTINGS} onSave={onSave} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('삭제 간격'), { target: { value: '0.3' } });
    // 저장 전에도 무슨 일이 일어날지 배너로 말한다
    expect(screen.getAllByText(/0.3초/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_RUN_SETTINGS, floorSec: 0.3 });
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
