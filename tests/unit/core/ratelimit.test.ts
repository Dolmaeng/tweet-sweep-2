import { describe, expect, it } from 'vitest';
import { parseRateLimit } from '../../../src/core/ratelimit';

const NOW = 1_700_000_000_000; // fixed clock

describe('parseRateLimit', () => {
  it('reads limit, remaining, and seconds until reset', () => {
    const nowSec = Math.floor(NOW / 1000);
    const rl = parseRateLimit(
      [
        { name: 'x-rate-limit-limit', value: '50' },
        { name: 'X-Rate-Limit-Remaining', value: '43' },
        { name: 'x-rate-limit-reset', value: String(nowSec + 300) },
        { name: 'content-type', value: 'application/json' },
      ],
      NOW,
    );
    expect(rl).toEqual({ limit: 50, remaining: 43, resetSec: 300 });
  });

  it('clamps a past reset to zero', () => {
    const nowSec = Math.floor(NOW / 1000);
    const rl = parseRateLimit(
      [
        { name: 'x-rate-limit-limit', value: '50' },
        { name: 'x-rate-limit-remaining', value: '0' },
        { name: 'x-rate-limit-reset', value: String(nowSec - 10) },
      ],
      NOW,
    );
    expect(rl?.resetSec).toBe(0);
  });

  it('returns null when headers are missing or non-numeric', () => {
    expect(parseRateLimit([{ name: 'content-type', value: 'x' }], NOW)).toBeNull();
    expect(
      parseRateLimit(
        [
          { name: 'x-rate-limit-limit', value: 'abc' },
          { name: 'x-rate-limit-remaining', value: '1' },
          { name: 'x-rate-limit-reset', value: '1' },
        ],
        NOW,
      ),
    ).toBeNull();
  });
});
