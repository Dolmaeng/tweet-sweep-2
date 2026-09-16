import { describe, expect, it } from 'vitest';
import { isGraphqlDelete, profileUrl, statusUrl } from '../../../src/core/xurl';

describe('xurl', () => {
  it('builds status and profile URLs', () => {
    expect(statusUrl('gujik_man', '123')).toBe('https://x.com/gujik_man/status/123');
    expect(profileUrl('gujik_man')).toBe('https://x.com/gujik_man');
  });

  it('detects DeleteTweet GraphQL URLs regardless of rotating queryId', () => {
    expect(isGraphqlDelete('https://x.com/i/api/graphql/AbC123xyz/DeleteTweet')).toBe(true);
    expect(isGraphqlDelete('https://x.com/i/api/graphql/Zzz/DeleteTweet?variables=%7B%7D')).toBe(
      true,
    );
    expect(isGraphqlDelete('https://x.com/i/api/graphql/AbC123xyz/CreateTweet')).toBe(false);
    expect(isGraphqlDelete('https://x.com/i/api/graphql/AbC/FavoriteTweet')).toBe(false);
  });
});
