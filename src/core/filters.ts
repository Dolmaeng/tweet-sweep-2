// 삭제 대상 선택 필터 (FR-04). 순수 함수. 새 조건은 여기 규칙 하나만 추가하면 된다.
import type { Post, PostKind } from './models';

export interface FilterSpec {
  /** 포함할 유형. 기본 원글+답글(RT 제외, SRS §2) */
  kinds?: PostKind[];
  /** ISO 날짜(포함). createdAt이 이 범위 안일 때만 대상 */
  from?: string;
  to?: string;
  /** 본문에 포함해야 할 문자열(소문자 비교) */
  keyword?: string;
  /** 본문 정규식(문자열). keyword와 함께 주면 둘 다 만족 */
  regex?: string;
  /** 보존할 글 id(고정글 등). 대상에서 제외 */
  keepIds?: string[];
  /** 좋아요가 이 값 이상이면 보존(대상 제외) */
  keepMinLikes?: number;
  /** 리포스트가 이 값 이상이면 보존 */
  keepMinRetweets?: number;
}

export const DEFAULT_KINDS: PostKind[] = ['post', 'reply'];

type Rule = (post: Post, spec: FilterSpec) => boolean;

// 각 규칙: "이 글을 대상으로 둘까?" true면 통과. 하나라도 false면 대상 아님.
const RULES: Rule[] = [
  (p, s) => (s.kinds ?? DEFAULT_KINDS).includes(p.kind),
  (p, s) => (s.from === undefined ? true : p.createdAt >= s.from),
  (p, s) => (s.to === undefined ? true : p.createdAt <= s.to),
  (p, s) =>
    s.keyword === undefined ? true : p.text.toLowerCase().includes(s.keyword.toLowerCase()),
  (p, s) => (s.regex === undefined ? true : safeRegex(s.regex).test(p.text)),
  (p, s) => !(s.keepIds ?? []).includes(p.id),
  (p, s) => (s.keepMinLikes === undefined ? true : p.likeCount < s.keepMinLikes),
  (p, s) => (s.keepMinRetweets === undefined ? true : p.retweetCount < s.keepMinRetweets),
];

function safeRegex(src: string): RegExp {
  try {
    return new RegExp(src, 'iu');
  } catch {
    // 잘못된 정규식은 아무 것도 매칭하지 않는다(대상 0)
    return /(?!)/;
  }
}

export function isTarget(post: Post, spec: FilterSpec): boolean {
  return RULES.every((rule) => rule(post, spec));
}

export function selectTargets(posts: Post[], spec: FilterSpec): Post[] {
  return posts.filter((p) => isTarget(p, spec));
}

export function isValidRegex(src: string): boolean {
  try {
    new RegExp(src, 'iu');
    return true;
  } catch {
    return false;
  }
}
