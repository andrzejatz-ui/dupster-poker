/**
 * Side-pot computation for No-Limit Hold'em.
 *
 * Input: für jeden Spieler (auch gefoldete) der gesamte Beitrag in dieser
 * Hand und ob er gefoldet hat. Output: Liste von Pots mit Höhe und Liste
 * berechtigter Spieler-Indizes.
 */

export interface PotContribution {
  seatIndex: number;
  total: number;
  hasFolded: boolean;
}

export interface SidePot {
  amount: number;
  eligibleSeatIndexes: number[];
}

export function computeSidePots(contributions: PotContribution[]): SidePot[] {
  if (contributions.length === 0) return [];

  // sort live ascending by total (folded players don't gate pots but their
  // chips still go in)
  const live = contributions.filter((c) => !c.hasFolded);
  const sorted = [...live].sort((a, b) => a.total - b.total);

  const pots: SidePot[] = [];
  let prevLevel = 0;

  const stillLive = new Set(sorted.map((c) => c.seatIndex));

  for (let i = 0; i < sorted.length; i++) {
    const level = sorted[i]!.total;
    if (level === prevLevel) continue;

    // contributions at this level from ALL players (incl. folded)
    let amount = 0;
    for (const c of contributions) {
      const slice = Math.max(0, Math.min(c.total, level) - prevLevel);
      amount += slice;
    }

    if (amount > 0) {
      pots.push({ amount, eligibleSeatIndexes: [...stillLive].sort((a, b) => a - b) });
    }

    prevLevel = level;
    stillLive.delete(sorted[i]!.seatIndex);
  }

  return pots;
}
