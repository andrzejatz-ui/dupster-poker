import type { Card, PlayerAction, Rank } from '@neon-poker/shared/poker';
import type { LegalActions } from '@neon-poker/shared/events';
import type { PokerTable, Seat } from './engine.js';
import { evaluateBest } from './handEvaluator.js';

/**
 * Heuristic poker bot. Plays like a thoughtful loose-aggressive human:
 * raises premium hands, defends in position, occasionally bluffs into
 * weakness, fires continuation bets after raising preflop, and folds
 * when it makes sense.
 *
 * STRICT FAIRNESS — the only information available to the bot is its
 * OWN hole cards, the public board, the public bet sizes and seat
 * counts, and its own seat's position relative to the button. The
 * function never inspects other seats' holeCards (the engine doesn't
 * surface them to anyone but the seat owner anyway, but we'd be
 * cheating if we did). Randomness is genuine Math.random for variety;
 * no opponent modelling beyond "what they put in the pot this hand".
 */

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function rv(c: Card): number { return RANK_VALUE[c[0] as Rank]; }
function suit(c: Card): string { return c[1]!; }

/**
 * Pre-flop strength on a 0..1 scale. Pairs, suited connectors and high
 * cards score well; offsuit garbage scores low. Roughly mirrors a Chen
 * formula compressed into the open interval.
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
    // Pairs: 22→0.42, 88→0.72, AA→0.97
    score = 0.37 + (a - 2) * 0.05;
  } else {
    // Base value from the high card (A=14→0.55 baseline, 2→0)
    score = (hi - 2) / 12 * 0.55;
    if (lo >= 10) score += 0.10; // both broadway
    else if (lo >= 7) score += 0.04;
    if (gap === 1) score += 0.07; // connector
    else if (gap === 2) score += 0.03;
    if (suited) score += 0.09;
    if (gap >= 5 && hi < 13) score -= 0.05; // wide unrelated gap
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * Post-flop strength derived from the evaluator output. Maps the 9
 * hand categories onto a 0..1 ramp; gives a board-pair-only pair a
 * negative bonus (it's mostly the community card pair, not yours).
 *
 * Also factors flush + straight DRAWS into the score so the bot can
 * semi-bluff with strong equity even when not yet made.
 */
function postflopStrength(hole: [Card, Card], board: Card[]): number {
  if (board.length < 3) {
    return preflopStrength(hole);
  }
  const all = [...hole, ...board];
  const best = evaluateBest(all);
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

  let bonus = 0;
  if (best.category === 'one_pair') {
    const pairRank = best.kickers[0]!;
    const pairInHole = hole.some((c) => c[0] === pairRank);
    bonus = pairInHole ? 0.10 : -0.10;
  }

  // Draws — add equity for flush + open-ended straight draws.
  if (best.category === 'high_card' || best.category === 'one_pair') {
    if (hasFlushDraw(all)) bonus += 0.18;
    if (hasOpenStraightDraw(all)) bonus += 0.14;
  }

  return Math.max(0.05, Math.min(0.99, 0.10 + idx * 0.11 + bonus));
}

/**
 * Four-card flush + need one more on the turn/river. Cheap-enough check
 * over 7-or-fewer cards.
 */
function hasFlushDraw(cards: Card[]): boolean {
  const counts: Record<string, number> = {};
  for (const c of cards) counts[c[1]!] = (counts[c[1]!] ?? 0) + 1;
  return Object.values(counts).some((n) => n === 4);
}

/**
 * Open-ended straight draw: four consecutive ranks (any A-5 wheel
 * counts too). Trades correctness for speed — duplicates don't matter
 * here because the ranks set keeps each unique.
 */
function hasOpenStraightDraw(cards: Card[]): boolean {
  const ranks = new Set(cards.map((c) => RANK_VALUE[c[0] as Rank]));
  if (ranks.has(14)) ranks.add(1); // wheel
  const arr = [...ranks].sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]! - arr[i - 1]! === 1) {
      run++;
      if (run >= 4) return true;
    } else run = 1;
  }
  return false;
}

export interface BotDecision {
  action: PlayerAction;
  /** Milliseconds the manager should wait before applying the action. */
  thinkMs: number;
}

/**
 * Pick a legal action for the bot. Caller supplies the precomputed
 * legal actions. Never returns an illegal move; if the engine reports
 * nothing is legal (e.g. the bot was knocked out of the hand between
 * scheduling and firing), defaults to fold.
 */
export function decideBotAction(args: {
  table: PokerTable;
  seat: Seat;
  legal: LegalActions;
}): BotDecision {
  const { table, seat, legal } = args;
  const hole = seat.holeCards;
  if (!hole) {
    return { action: { type: 'fold' }, thinkMs: 500 };
  }

  const isPreflop = table.board.length === 0;
  const street = isPreflop ? 'preflop' : table.board.length === 3 ? 'flop' : table.board.length === 4 ? 'turn' : 'river';
  const baseStrength = isPreflop
    ? preflopStrength(hole as [Card, Card])
    : postflopStrength(hole as [Card, Card], table.board);

  // ---- Position awareness ------------------------------------------
  // Late position (button / cutoff) tightens our fold range and widens
  // our bluff range. Approximated as: closer to button = higher = better.
  const position = relativePosition(table, seat);
  // positionBoost ∈ [-0.05, +0.05]: BTN gets +0.05, BB/SB get -0.05.
  const positionBoost = (position - 0.5) * 0.10;

  // ---- Aggression style — each bot rolls a personality once per hand
  // via a deterministic-ish hash of (seat + hand). Loose & passive bots
  // call thinner; tight aggressive bots raise more; maniacs bluff more.
  const personality = personalityFor(seat, table);

  // ---- Bluff frequency ---------------------------------------------
  // True ~12-25% of the time, weighted by personality and street. Bots
  // bluff more on the river when the board is "scary" (3+ same suit or
  // 4+ connected) — a thinking human would too.
  const bluffRoll = Math.random();
  const bluffThreshold =
    personality.bluffiness *
    (street === 'river' ? 0.32 : street === 'turn' ? 0.20 : street === 'flop' ? 0.16 : 0.08) *
    (boardLooksScary(table.board) ? 1.4 : 1.0);
  const isBluffing = bluffRoll < bluffThreshold && baseStrength < 0.55;

  // Effective hand "perceived strength" — what the bot is REPRESENTING.
  let perceivedStrength = baseStrength + positionBoost + personality.tilt;
  if (isBluffing) perceivedStrength = 0.78 + Math.random() * 0.12;
  perceivedStrength = Math.max(0, Math.min(1, perceivedStrength));

  // Pot-odds estimate.
  const toCall = legal.callAmount;
  const potBefore = table.pot;
  const callRatio = toCall > 0 ? toCall / Math.max(1, potBefore + toCall) : 0;

  // Per-bot reaction-time variability — each personality has its own
  // pace, so a snap-caller fires in <1 s while a deliberate player
  // takes 3-4 s on the same spot. Tough spots add extra delay for
  // everyone (people DO take longer on close decisions). The clamp
  // keeps the slowest bot under 6 s so a full ring doesn't crawl,
  // and the fastest above 400 ms so it still feels like thinking.
  const baseThink = legal.canCheck ? 800 : 1200;
  const tough = !legal.canCheck && callRatio > 0.25;
  // pace 0 → 2.4× multiplier (slow), pace 1 → 0.4× (fast).
  const paceMultiplier = 0.4 + (1 - personality.pace) * 2.0;
  const variability = Math.floor(Math.random() * (tough ? 1400 : 900));
  const rawThink = (baseThink + variability) * paceMultiplier;
  const thinkMs = Math.max(400, Math.min(6000, Math.round(rawThink)));

  // ---- Decision tree -----------------------------------------------

  // 1. Free check available?
  if (legal.canCheck) {
    // Probe-bet / continuation-bet if we look strong OR we're bluffing.
    if (legal.canBet && (perceivedStrength > 0.66 || isBluffing) && Math.random() < (isBluffing ? 0.65 : 0.50)) {
      const size = isBluffing
        ? sizedBet(potBefore, 0.45 + Math.random() * 0.30, legal.minBet, seat.stack)
        : sizedBet(potBefore, 0.55 + Math.random() * 0.45, legal.minBet, seat.stack);
      return { action: { type: 'bet', amount: size }, thinkMs };
    }
    return { action: { type: 'check' }, thinkMs };
  }

  // 2. Facing a bet — call / raise / fold / all-in.
  // Monster / nut-likely: build the pot.
  if (perceivedStrength > 0.88) {
    if (legal.canRaise) {
      // 70-90% pot raise, occasionally a "slow play" by just calling.
      if (Math.random() < 0.18 && legal.canCall) {
        return { action: { type: 'call' }, thinkMs };
      }
      const target = sizedRaise(potBefore, 0.7 + Math.random() * 0.4, legal, seat);
      return { action: { type: 'raise', amount: target }, thinkMs };
    }
    if (legal.canAllIn && Math.random() < 0.4) return { action: { type: 'all_in' }, thinkMs };
    if (legal.canCall) return { action: { type: 'call' }, thinkMs };
  }

  // Strong: raise sometimes, otherwise call.
  if (perceivedStrength > 0.68) {
    const raiseChance = isBluffing ? 0.55 : personality.aggression * 0.55 + 0.15;
    if (legal.canRaise && Math.random() < raiseChance) {
      const target = sizedRaise(potBefore, 0.5 + Math.random() * 0.4, legal, seat);
      return { action: { type: 'raise', amount: target }, thinkMs };
    }
    if (legal.canCall) return { action: { type: 'call' }, thinkMs };
  }

  // Medium: call if pot odds are reasonable; sometimes float OOP.
  if (perceivedStrength > 0.42) {
    const oddsOk = callRatio <= 0.40 + personality.callTolerance * 0.20;
    if (legal.canCall && oddsOk) return { action: { type: 'call' }, thinkMs };
    if (legal.canCall && Math.random() < 0.15 * personality.callTolerance) {
      return { action: { type: 'call' }, thinkMs };
    }
    return { action: { type: 'fold' }, thinkMs };
  }

  // Weak: occasional pure bluff-raise (cheap stab), otherwise fold to
  // anything but a free call.
  if (isBluffing && legal.canRaise && Math.random() < 0.35) {
    const target = sizedRaise(potBefore, 0.6 + Math.random() * 0.3, legal, seat);
    return { action: { type: 'raise', amount: target }, thinkMs };
  }
  if (legal.canCall && callRatio <= 0.08) {
    return { action: { type: 'call' }, thinkMs };
  }
  return { action: { type: 'fold' }, thinkMs };
}

/**
 * 0 = BB (earliest post-blind position to act), 1 = BTN (latest, best
 * position). For heads-up / 3-handed the gradient compresses but the
 * relative ordering is preserved.
 */
function relativePosition(table: PokerTable, seat: Seat): number {
  const button = table.buttonSeat;
  if (button === null) return 0.5;
  const live = [...table.seats.values()]
    .filter((s) => !s.isSittingOut)
    .map((s) => s.seatIndex)
    .sort((a, b) => a - b);
  if (live.length < 2) return 0.5;
  // Walk from button+1 (SB) around the ring; count distance to seat.
  const btnIdx = live.indexOf(button);
  if (btnIdx < 0) return 0.5;
  let n = live.length;
  let distAfterBtn = 0;
  for (let i = 1; i <= n; i++) {
    const idx = live[(btnIdx + i) % n]!;
    if (idx === seat.seatIndex) {
      distAfterBtn = i;
      break;
    }
  }
  // distAfterBtn = 1 → SB → worst post-button position. n → button →
  // best. Normalize to 0..1.
  return (distAfterBtn - 1) / (n - 1);
}

interface Personality {
  /** 0 (rock-tight) … 1 (maniac). Drives raise frequency on strong hands. */
  aggression: number;
  /** 0 (folds easy) … 1 (calls everything). Loosens call threshold. */
  callTolerance: number;
  /** 0 (never bluffs) … 1 (bluffs constantly). */
  bluffiness: number;
  /** Hand-specific bias on perceived strength, ±0.06. */
  tilt: number;
  /** 0 (slow & deliberate) … 1 (snap-decision). Scales the per-action
   *  think delay so different bots feel like different humans —
   *  some take their time, some click instantly. */
  pace: number;
}

/**
 * Roll a stable personality for this seat at this hand. Deterministic
 * given (seatIndex, handNumber) so the bot doesn't flip styles mid-hand.
 */
function personalityFor(seat: Seat, table: PokerTable): Personality {
  // Stable per-hand pseudo-random: xorshift on (seatIndex * handNumber).
  const handNumber = table.handNumber || 1;
  let s = (seat.seatIndex + 1) * 0x9e3779b1 ^ (handNumber * 0x85ebca6b);
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    // map to [0, 1)
    return ((s >>> 0) % 100_000) / 100_000;
  };
  return {
    aggression: 0.30 + next() * 0.55,    // 0.30–0.85
    callTolerance: 0.30 + next() * 0.55, // 0.30–0.85
    bluffiness: 0.20 + next() * 0.70,    // 0.20–0.90
    tilt: (next() - 0.5) * 0.12,         // ±0.06
    pace: next(),                        // 0–1, scales think-time
  };
}

/**
 * "Scary" board = multiple cards of the same suit or four+ ranks within
 * a 5-rank window. Triggers more bluffs on later streets.
 */
function boardLooksScary(board: Card[]): boolean {
  if (board.length < 3) return false;
  const counts: Record<string, number> = {};
  for (const c of board) counts[c[1]!] = (counts[c[1]!] ?? 0) + 1;
  if (Object.values(counts).some((n) => n >= 3)) return true;
  const ranks = [...new Set(board.map((c) => RANK_VALUE[c[0] as Rank]))].sort((a, b) => a - b);
  for (let i = 0; i < ranks.length - 2; i++) {
    if (ranks[i + 2]! - ranks[i]! <= 4) return true;
  }
  return false;
}

/** Bet sized as a fraction of the pot, clipped to the legal range. */
function sizedBet(pot: number, frac: number, minBet: number, maxStack: number): number {
  const raw = Math.floor(Math.max(pot, 0) * frac);
  return clamp(raw, minBet, maxStack);
}

/**
 * Raise size: aim at `frac` of the pot ABOVE the current bet, then
 * clamp to (minRaise, maxRaise). Occasionally jam when the raise
 * commits more than 60% of stack — humans rarely leave themselves
 * pot-committed-but-not-all-in.
 */
function sizedRaise(pot: number, frac: number, legal: LegalActions, seat: Seat): number {
  const target = legal.minRaise + Math.floor(Math.max(pot, 0) * frac);
  let clamped = clamp(target, legal.minRaise, legal.maxRaise);
  // Auto-jam threshold — commit-or-fold reasoning.
  if (clamped > seat.stack * 0.65 && legal.canAllIn) {
    clamped = legal.maxRaise;
  }
  return clamped;
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, v));
}
