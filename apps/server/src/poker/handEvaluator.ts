import type { Card, HandCategory, HandRank, Rank } from '@neon-poker/shared/poker';
import { HAND_CATEGORIES } from '@neon-poker/shared/poker';

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const CATEGORY_INDEX: Record<HandCategory, number> = Object.fromEntries(
  HAND_CATEGORIES.map((c, i) => [c, i]),
) as Record<HandCategory, number>;

/** Tiebreaker is up to 5 rank values (descending priority). */
const TIE_BREAKER_BASE = 15;

function rankOf(c: Card): Rank { return c[0] as Rank; }
function suitOf(c: Card): string { return c[1]!; }
function rv(c: Card): number { return RANK_VALUE[rankOf(c)]; }

function encodeScore(category: HandCategory, tiebreakers: number[]): number {
  let score = CATEGORY_INDEX[category];
  for (let i = 0; i < 5; i++) {
    score = score * TIE_BREAKER_BASE + (tiebreakers[i] ?? 0);
  }
  return score;
}

interface EvaluatedFive {
  category: HandCategory;
  score: number;
  kickers: Rank[];
  cards: Card[];
}

/**
 * Evaluate exactly 5 cards. Returns the highest hand they form.
 * For 7-card evaluation use {@link evaluateBest}.
 */
export function evaluateFive(five: Card[]): EvaluatedFive {
  if (five.length !== 5) throw new Error('evaluateFive requires 5 cards');

  // Sort descending by rank for tiebreaker construction
  const sorted = [...five].sort((a, b) => rv(b) - rv(a));
  const values = sorted.map(rv);

  // group by rank value
  const counts = new Map<number, Card[]>();
  for (const c of sorted) {
    const v = rv(c);
    const arr = counts.get(v) ?? [];
    arr.push(c);
    counts.set(v, arr);
  }

  // by frequency desc, then rank desc
  const grouped = [...counts.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return b[0] - a[0];
  });

  const isFlush = sorted.every((c) => suitOf(c) === suitOf(sorted[0]!));

  // straight detection: 5 distinct, max-min===4, OR special A-2-3-4-5 wheel
  const uniq = [...new Set(values)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0]! - uniq[4]! === 4) straightHigh = uniq[0]!;
    else if (
      uniq[0] === 14 &&
      uniq[1] === 5 &&
      uniq[2] === 4 &&
      uniq[3] === 3 &&
      uniq[4] === 2
    ) {
      straightHigh = 5; // wheel
    }
  }

  // Straight flush
  if (isFlush && straightHigh) {
    return finalize('straight_flush', [straightHigh], sorted);
  }
  // Four of a kind
  if (grouped[0]![1].length === 4) {
    const quad = grouped[0]![0];
    const kicker = grouped[1]![0];
    return finalize('four_of_a_kind', [quad, kicker], sorted);
  }
  // Full house
  if (grouped[0]![1].length === 3 && grouped[1] && grouped[1]![1].length >= 2) {
    return finalize('full_house', [grouped[0]![0], grouped[1]![0]], sorted);
  }
  // Flush
  if (isFlush) {
    return finalize('flush', values, sorted);
  }
  // Straight
  if (straightHigh) {
    return finalize('straight', [straightHigh], sorted);
  }
  // Three of a kind
  if (grouped[0]![1].length === 3) {
    const trip = grouped[0]![0];
    const kickers = grouped.slice(1).map((g) => g[0]);
    return finalize('three_of_a_kind', [trip, ...kickers], sorted);
  }
  // Two pair
  if (grouped[0]![1].length === 2 && grouped[1] && grouped[1]![1].length === 2) {
    const hi = grouped[0]![0];
    const lo = grouped[1]![0];
    const kicker = grouped[2]![0];
    return finalize('two_pair', [hi, lo, kicker], sorted);
  }
  // One pair
  if (grouped[0]![1].length === 2) {
    const pair = grouped[0]![0];
    const kickers = grouped.slice(1).map((g) => g[0]);
    return finalize('one_pair', [pair, ...kickers], sorted);
  }
  // High card
  return finalize('high_card', values, sorted);
}

function finalize(
  category: HandCategory,
  tiebreakerValues: number[],
  cards: Card[],
): EvaluatedFive {
  const kickers = tiebreakerValues.map(valueToRank);
  return {
    category,
    score: encodeScore(category, tiebreakerValues),
    kickers,
    cards,
  };
}

function valueToRank(v: number): Rank {
  for (const [r, val] of Object.entries(RANK_VALUE) as [Rank, number][]) {
    if (val === v) return r;
  }
  throw new Error(`bad rank value ${v}`);
}

/** All ${n \choose 5}$ 5-subsets of an array of size ≥5. */
function* combinations5<T>(items: T[]): Generator<T[]> {
  const n = items.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            yield [items[a]!, items[b]!, items[c]!, items[d]!, items[e]!];
}

/**
 * Evaluate best 5-of-N hand. N must be ≥ 5 (typically 7 in Hold'em:
 * 2 hole + 5 board).
 */
export function evaluateBest(cards: Card[]): HandRank {
  if (cards.length < 5) throw new Error('need ≥5 cards');
  let best: EvaluatedFive | null = null;
  for (const five of combinations5(cards)) {
    const r = evaluateFive(five);
    if (!best || r.score > best.score) best = r;
  }
  return best!;
}

/** Human label, e.g. "Two pair, Kings and Nines". Kept brief. */
export function describeHand(rank: HandRank): string {
  const r2name = (r: Rank) =>
    ({ T: 'Tens', J: 'Jacks', Q: 'Queens', K: 'Kings', A: 'Aces' }[r] ??
      r + 's');
  const k = rank.kickers;
  switch (rank.category) {
    case 'high_card':       return `High card ${k[0]}`;
    case 'one_pair':        return `Pair of ${r2name(k[0]!)}`;
    case 'two_pair':        return `Two pair, ${r2name(k[0]!)} and ${r2name(k[1]!)}`;
    case 'three_of_a_kind': return `Three of a kind, ${r2name(k[0]!)}`;
    case 'straight':        return `Straight, ${k[0]}-high`;
    case 'flush':           return `Flush, ${k[0]}-high`;
    case 'full_house':      return `Full house, ${r2name(k[0]!)} over ${r2name(k[1]!)}`;
    case 'four_of_a_kind':  return `Four of a kind, ${r2name(k[0]!)}`;
    case 'straight_flush':  return k[0] === 'A' ? 'Royal flush' : `Straight flush, ${k[0]}-high`;
  }
}
