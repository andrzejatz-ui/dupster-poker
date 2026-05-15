import { randomInt } from 'node:crypto';
import { RANKS, SUITS, type Card } from '@neon-poker/shared/poker';

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(`${r}${s}` as Card);
  return deck;
}

/**
 * Fisher-Yates shuffle backed by crypto.randomInt.
 * The deck is mutated in place. Never expose this array to clients.
 */
export function shuffleInPlace<T>(deck: T[]): T[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}

export function makeShuffledDeck(): Card[] {
  return shuffleInPlace(makeDeck());
}

/** Mutates: removes and returns the top card. Throws if deck empty. */
export function drawCard(deck: Card[]): Card {
  const c = deck.pop();
  if (!c) throw new Error('deck_empty');
  return c;
}
