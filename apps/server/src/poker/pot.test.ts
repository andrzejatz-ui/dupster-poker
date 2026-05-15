import { describe, expect, it } from 'vitest';
import { computeSidePots } from './pot.js';

describe('side pots', () => {
  it('single pot if everyone contributed equally', () => {
    const pots = computeSidePots([
      { seatIndex: 0, total: 100, hasFolded: false },
      { seatIndex: 1, total: 100, hasFolded: false },
      { seatIndex: 2, total: 100, hasFolded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(300);
    expect(pots[0]!.eligibleSeatIndexes).toEqual([0, 1, 2]);
  });

  it('all-in player creates a side pot', () => {
    // Seat 0 all-in 50, seats 1 & 2 each put 200
    const pots = computeSidePots([
      { seatIndex: 0, total: 50, hasFolded: false },
      { seatIndex: 1, total: 200, hasFolded: false },
      { seatIndex: 2, total: 200, hasFolded: false },
    ]);
    // Main pot: 50*3 = 150, eligible 0,1,2
    // Side pot: 150*2 = 300, eligible 1,2
    expect(pots).toEqual([
      { amount: 150, eligibleSeatIndexes: [0, 1, 2] },
      { amount: 300, eligibleSeatIndexes: [1, 2] },
    ]);
  });

  it('folded players still contribute to pots', () => {
    const pots = computeSidePots([
      { seatIndex: 0, total: 100, hasFolded: true },
      { seatIndex: 1, total: 100, hasFolded: false },
      { seatIndex: 2, total: 100, hasFolded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(300);
    expect(pots[0]!.eligibleSeatIndexes).toEqual([1, 2]);
  });
});
