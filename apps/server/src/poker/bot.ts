import type { Card, PlayerAction, Rank } from '@neon-poker/shared/poker';
import type { LegalActions } from '@neon-poker/shared/events';
import type { PokerTable, Seat } from './engine.js';
import { evaluateBest } from './handEvaluator.js';

/**
 * Tiny heuristic poker bot. Goal: provide a believable opponent for the
 * admin test-room, not a competitive solver. The logic is deterministic
 * given the seed (we use Math.random for variety) and never references
 * other seats' hole cards.
 *
 * Strategy in plain words:
 *   - Pre-flop: ranking based on a simple Chen-style score of the two
 *     hole cards. Premium hands raise; medium hands call; trash folds
 *     to any bet, otherwise checks.
 *   - Post-flop: evaluate best 5-of-(hole+board). Strong made hands raise
 *     /jam, medium hands call, weak hands fold to anything but a free
 *     check. A small noise term (~5%) makes the bot occasionally bluff
 *     or fold spew so play stays interesting.
 *
 * The bot never thinks longer than 2.5s — the manager wraps the decision
 * in a setTimeout to make it feel human.
 */

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function rv(c: Card): number { return RANK_VALUE[c[0] as Rank]; }
function suit(c: Card): string { return c[1]!; }

/**
 * Pre-flop strength on a 0..1 scale. Pairs, suited connectors and high
 * cards score well; offsuit garbage scores low. Maps loosely onto Chen's
 * formula but compressed into the open interval.
 */
function preflopStrength(hole: [Card, Card]): number {
  const a = rv(hole[0]);
  const b = rv(hole[1]);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const suited = suit(hole[0]) === suit(hole[1]);
  const gap = hi - lo;

  let score: number;
  if (a === b) {
    // Pairs: 22→0.40, 88→0.65, AA→0.95
    score = 0.35 + (a - 2) * 0.05;
  } else {
    // Base value from the high card (A=1.0 → 2=0.0)
    score = (hi - 2) / 12 * 0.55;
    // Bonus for the second card being broadway
    if (lo >= 10) score += 0.08;
    // Connector / one-gap bonus
    if (gap === 1) score += 0.06;
    else if (gap === 2) score += 0.03;
    // Suited bonus
    if (suited) score += 0.07;
    // Penalty for very wide gaps
    if (gap >= 5 && hi < 13) score -= 0.05;
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * Postflop strength derived from the evaluator score. Maps the raw 9
 * hand categories onto a 0..1 ramp; ignores kicker subtleties because
 * the bot doesn't need exact odds — just the order of magnitude.
 *
 * Categories (low → high): high_card .. straight_flush. We linearly
 * map them onto [0.10, 0.98] so even high-card has a small floor and
 * straight-flushes max out without being a perfect 1.
 */
function postflopStrength(hole: [Card, Card], board: Card[]): number {
  if (board.length < 3) {
    // shouldn't happen — bot only acts post-flop with ≥3 community cards
    return preflopStrength(hole);
  }
  const best = evaluateBest([...hole, ...board]);
  const CATEGORY_RANK: Record<string, number> = {
    high_card: 0,
    one_pair: 1,
    two_pair: 2,
    three_of_a_kind: 3,
    straight: 4,
    flush: 5,
    full_house: 6,
    four_of_a_kind: 7,
    straight_flush: 8,
  };
  const idx = CATEGORY_RANK[best.category] ?? 0;
  // One-pair gets a softness bonus if the pair is on the board (just a
  // pair of community cards is weak) versus pair using a hole card.
  let bonus = 0;
  if (best.category === 'one_pair') {
    const pairRank = best.kickers[0]!;
    const pairInHole = hole.some((c) => c[0] === pairRank);
    bonus = pairInHole ? 0.08 : -0.06;
  }
  return Math.max(0.05, Math.min(0.99, 0.10 + idx * 0.11 + bonus));
}

export interface BotDecision {
  action: PlayerAction;
  /** Milliseconds the manager should wait before applying the action. */
  thinkMs: number;
}

/**
 * Pick a legal action for the bot. Caller supplies the precomputed legal
 * actions (the engine produces them anyway via legalActionsFor). Never
 * returns an illegal move; if the engine reports nothing is legal (e.g.
 * the bot was knocked out of the hand between scheduling and firing),
 * defaults to fold.
 */
export function decideBotAction(args: {
  table: PokerTable;
  seat: Seat;
  legal: LegalActions;
}): BotDecision {
  const { table, seat, legal } = args;
  const hole = seat.holeCards;
  if (!hole) {
    return { action: { type: 'fold' }, thinkMs: 600 };
  }

  const isPreflop = table.board.length === 0;
  const strength = isPreflop
    ? preflopStrength(hole as [Card, Card])
    : postflopStrength(hole as [Card, Card], table.board);

  // Pot-odds estimate — how committed must we be to call?
  const toCall = legal.callAmount;
  const potBefore = table.pot;
  const callRatio = toCall > 0 ? toCall / Math.max(1, potBefore + toCall) : 0;

  // A small noise term keeps play unpredictable.
  const noise = (Math.random() - 0.5) * 0.18;
  const score = Math.max(0, Math.min(1, strength + noise));

  // Random think-delay: faster on free actions, slower on tough spots.
  const baseThink = legal.canCheck ? 900 : 1500;
  const thinkMs = baseThink + Math.floor(Math.random() * 1000);

  // ---- Decision tree ------------------------------------------------

  // 1. Free check? Almost always check; occasionally probe with a min-bet.
  if (legal.canCheck) {
    if (legal.canBet && score > 0.72 && Math.random() < 0.35) {
      const amt = clamp(legal.minBet, legal.minBet, Math.max(legal.minBet, Math.floor(potBefore * 0.5)));
      return { action: { type: 'bet', amount: amt }, thinkMs };
    }
    return { action: { type: 'check' }, thinkMs };
  }

  // 2. Facing a bet — decide on the (call / raise / fold / all-in) axis.
  // Very strong hand: raise big or jam.
  if (score > 0.85) {
    if (legal.canRaise) {
      // Aim for ~70% of stack on monster hands, but respect min/max.
      const target = Math.floor(seat.stack * 0.7) + seat.currentBet;
      const amt = clamp(target, legal.minRaise, legal.maxRaise);
      return { action: { type: 'raise', amount: amt }, thinkMs };
    }
    if (legal.canAllIn) return { action: { type: 'all_in' }, thinkMs };
    if (legal.canCall) return { action: { type: 'call' }, thinkMs };
  }

  // Strong-ish: raise small or call.
  if (score > 0.65) {
    if (legal.canRaise && Math.random() < 0.45) {
      const target = legal.minRaise + Math.floor((legal.maxRaise - legal.minRaise) * 0.25);
      const amt = clamp(target, legal.minRaise, legal.maxRaise);
      return { action: { type: 'raise', amount: amt }, thinkMs };
    }
    if (legal.canCall) return { action: { type: 'call' }, thinkMs };
  }

  // Medium: call if pot odds are reasonable.
  if (score > 0.40) {
    if (legal.canCall && callRatio <= 0.45) {
      return { action: { type: 'call' }, thinkMs };
    }
    if (legal.canCall && Math.random() < 0.2) {
      // Loose-passive sometimes calls when they shouldn't
      return { action: { type: 'call' }, thinkMs };
    }
    return { action: { type: 'fold' }, thinkMs };
  }

  // Weak: fold to anything but a free call.
  if (legal.canCall && callRatio <= 0.10) {
    return { action: { type: 'call' }, thinkMs };
  }
  return { action: { type: 'fold' }, thinkMs };
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, v));
}
