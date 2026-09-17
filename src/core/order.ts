// 삭제 순서 (FR-10a). 순수 함수, 브라우저 API 무의존.
//
// 글 ID(스노우플레이크)는 시간순으로 증가하므로 ID 비교가 곧 작성 시각 비교다.
// 단, **문자열 비교는 틀린다**: 2017-11 이전 글은 18자리, 이후는 19자리라
// "934…"(2017) > "1734…"(2024)로 뒤집힌다. 그래서 자릿수를 먼저 비교한다.
import type { DeleteOrder } from './models';

/** 앞의 0을 떼고 자릿수 → 사전순으로 비교. 숫자 문자열 전용(BigInt 파싱 없이 정확) */
export function compareIds(a: string, b: string): number {
  const na = a.replace(/^0+(?=\d)/, '');
  const nb = b.replace(/^0+(?=\d)/, '');
  if (!/^\d+$/.test(na) || !/^\d+$/.test(nb)) return na < nb ? -1 : na > nb ? 1 : 0;
  if (na.length !== nb.length) return na.length - nb.length;
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/**
 * 다음에 지울 글. `newest`면 가장 큰 ID(최신), `oldest`면 가장 작은 ID(과거).
 * 정렬 없이 한 번 훑어 극값만 고른다(O(n), 대상 수만 명이어도 1ms 수준).
 */
export function pickNextPostId(postIds: readonly string[], order: DeleteOrder): string | null {
  let best: string | null = null;
  for (const id of postIds) {
    if (best === null) {
      best = id;
      continue;
    }
    const cmp = compareIds(id, best);
    if (order === 'newest' ? cmp > 0 : cmp < 0) best = id;
  }
  return best;
}

/** 저장값이 없거나 손상됐을 때의 기본값(사용자 요청: 최신부터) */
export function coerceOrder(raw: unknown): DeleteOrder {
  return raw === 'oldest' ? 'oldest' : 'newest';
}

export const ORDER_LABELS: Record<DeleteOrder, string> = {
  newest: '최신 글부터',
  oldest: '과거 글부터',
};
