import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../../src/entrypoints/dashboard/App';
import { resetDb } from '../../../src/platform/db';

describe('dashboard App', () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterEach(() => cleanup());

  it('shows the risk notice first and remembers consent', async () => {
    render(<App />);
    await screen.findByText('시작 전에 읽어주세요');

    const button = screen.getByRole('button', { name: '계속' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await screen.findByText('가져온 아카이브가 없습니다. 먼저 아카이브를 가져오세요.');
    cleanup();

    // 다시 열면 고지를 건너뛴다 (동의 저장)
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '계정' })).toBeTruthy());
  });
});
