import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs with vitest globals and happy-dom', () => {
    expect(typeof document).toBe('object');
    expect(1 + 1).toBe(2);
  });
});
