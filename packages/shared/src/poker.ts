/**
 * Karten und Hand-Ranking-Primitives. Reines Datenmodell — keine I/O.
 * Server UND Web dürfen das importieren. Hole Cards anderer Spieler
 * werden trotzdem niemals an den Client gesendet.
 */

export const SUITS = ['c', 'd', 'h', 's'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A',
] as const;
export type Rank = (typeof RANKS)[number];

/** Kompakte 2-Char-Repräsentation, z.B. "Ah", "Td", "2c". */
export type Card = `${Rank}${Suit}`;

export const HAND_CATEGORIES = [
  'high_card',
  'one_pair',
  'two_pair',
  'three_of_a_kind',
  'straight',
  'flush',
  'full_house',
  'four_of_a_kind',
  'straight_flush',
] as const;
export type HandCategory = (typeof HAND_CATEGORIES)[number];

/**
 * Hand-Rank für Vergleiche. `score` ist ein einzelner monoton steigender
 * Wert, mit dem zwei Hände direkt verglichen werden können (höher gewinnt).
 * `kickers` ist nur für Debug/UI.
 */
export interface HandRank {
  category: HandCategory;
  score: number;
  kickers: Rank[];
  /** Die 5 Karten, die für die Hand gewertet wurden. */
  cards: Card[];
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type PlayerAction =
  | { type: 'check' }
  | { type: 'fold' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }
  | { type: 'all_in' };

export type PlayerActionType = PlayerAction['type'];
