import { describe, expect, it } from 'vitest';
import { graphqlOperation, isGraphqlDelete, profileUrl, statusUrl } from '../../../src/core/xurl';

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
  it('연산명을 읽는다 — 읽기 버킷도 관측해야 한다 (ADR-0014)', () => {
    expect(graphqlOperation('https://x.com/i/api/graphql/Abc/TweetDetail')).toBe('TweetDetail');
    expect(graphqlOperation('https://x.com/i/api/graphql/Ab/UserTweetsAndReplies?v=1')).toBe(
      'UserTweetsAndReplies',
    );
    expect(graphqlOperation('https://x.com/home')).toBeNull();
  });
});
