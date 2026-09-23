import { describe, expect, it } from 'vitest';
import {
  allTabUrl,
  graphqlOperation,
  isGraphqlDelete,
  isSweepTabPath,
  profileUrl,
  statusUrl,
  sweepTabPath,
  sweepTimelineUrl,
  withRepliesUrl,
} from '../../../src/core/xurl';

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

describe('스윕 타임라인 주소 (ADR-0016)', () => {
  it('기본은 전체 탭 — 답글 탭이 아니다', () => {
    expect(allTabUrl('gujik_man')).toBe('https://x.com/gujik_man/all');
    expect(sweepTimelineUrl('gujik_man', 'all')).toBe('https://x.com/gujik_man/all');
  });

  it('답글만 노릴 때만 답글 탭', () => {
    expect(sweepTimelineUrl('gujik_man', 'with_replies')).toBe(
      'https://x.com/gujik_man/with_replies',
    );
    expect(withRepliesUrl('gujik_man')).toBe('https://x.com/gujik_man/with_replies');
  });

  it('탭이 선택됐을 때의 경로 — 주소가 맞는지 검사하는 근거', () => {
    expect(sweepTabPath('gujik_man', 'all')).toBe('/gujik_man/all');
    expect(sweepTabPath('gujik_man', 'with_replies')).toBe('/gujik_man/with_replies');
  });
});

describe('isSweepTabPath', () => {
  it('대소문자 차이로 실행을 멈추지 않는다', () => {
    expect(isSweepTabPath('/Gujik_Man/all', 'gujik_man', 'all')).toBe(true);
    expect(isSweepTabPath('/gujik_man/all', 'gujik_man', 'all')).toBe(true);
  });

  it('다른 탭이면 false — 엉뚱한 타임라인에서 지우면 안 된다', () => {
    expect(isSweepTabPath('/gujik_man', 'gujik_man', 'all')).toBe(false);
    expect(isSweepTabPath('/gujik_man/media', 'gujik_man', 'all')).toBe(false);
    expect(isSweepTabPath('/gujik_man/with_replies', 'gujik_man', 'all')).toBe(false);
    expect(isSweepTabPath('/someone/all', 'gujik_man', 'all')).toBe(false);
  });
});
