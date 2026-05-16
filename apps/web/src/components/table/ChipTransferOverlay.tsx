'use client';

interface Winner {
  seatIndex: number;
  amount: number;
}

interface Revealed {
  seatIndex: number;
}

interface Pos {
  x: number;
  y: number;
}

interface Props {
  winners: Winner[];
  revealed: Revealed[];
  seatPositions: Pos[];
}

/**
 * Chip-payout visual: a cascade of bevelled gold chips flies from the
 * pot (centre of the felt) to each winner's seat, with a brief gold
 * shockwave at the pot to kick the animation off. Mirrors what actually
 * happens at a real table — the dealer pushes the pot to the winner —
 * instead of the previous "Eye grabs from losers" laser metaphor that
 * read as backwards (losers' chips are already in the pot).
 *
 * Pure CSS-driven: each chip is an absolutely-positioned div that
 * animates `left`/`top` from 50%,50% to the winner's seat coordinates
 * via the chipFly keyframes in globals.css. Number of chips scales
 * loosely with the pot share so a 5000-chip win looks heavier than a
 * 200-chip win without ever overwhelming the felt.
 *
 * Split-pot safe — every winner with amount > 0 gets their own cascade.
 * Uncalled wins (no `revealed` rows) skip the overlay entirely; the
 * banner alone carries the story.
 */
export function ChipTransferOverlay({ winners, revealed, seatPositions }: Props) {
  // Only the seats that actually won chips need a cascade.
  const payoutWinners = winners.filter((w) => w.amount > 0);
  if (payoutWinners.length === 0) return null;
  // If we don't even have a showdown, the banner alone is enough.
  if (revealed.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Gold shockwave at the pot — fires once, signals "pot is moving" */}
      <span className="pot-burst" />

      {payoutWinners.map((w) => {
        const pos = seatPositions[w.seatIndex];
        if (!pos) return null;
        const chipCount = chipCountFor(w.amount);
        return (
          <div key={w.seatIndex}>
            {Array.from({ length: chipCount }).map((_, i) => (
              <span
                key={i}
                className="chip-fly"
                style={
                  {
                    '--target-x': `${pos.x}%`,
                    '--target-y': `${pos.y}%`,
                    // Tiny random lateral wobble so the cascade doesn't
                    // look like a single ruler-straight line.
                    '--jitter-x': `${(Math.random() - 0.5) * 4}px`,
                    '--jitter-y': `${(Math.random() - 0.5) * 4}px`,
                    animationDelay: `${0.18 + i * 0.07}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Chips per cascade as a function of the won amount. Log-ish so even
 * a small pot gets a visible handful, and a monster pot doesn't spawn
 * 200 elements. Clamped to [3, 14].
 */
function chipCountFor(amount: number): number {
  if (amount <= 0) return 0;
  const raw = Math.round(3 + Math.log10(Math.max(10, amount)) * 2.4);
  return Math.max(3, Math.min(14, raw));
}
