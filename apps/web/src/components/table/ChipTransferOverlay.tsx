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
 * Visual chip-transfer effect rendered on top of the felt during the
 * 8 s result window. The Eye (centre of the table) "grabs" chips from
 * each losing showdown seat with a red laser and then "drops" them
 * onto the winner's seat with a gold laser.
 *
 * Pure SVG, animated via CSS keyframes (.laser-line / .laser-line--gold
 * in globals.css). No JS animation loop, no per-frame state.
 *
 * Skips rendering when there's nothing useful to show — uncalled wins
 * leave no `revealed` rows so the overlay simply stays out of the way
 * and the banner alone covers the story.
 */
export function ChipTransferOverlay({ winners, revealed, seatPositions }: Props) {
  if (winners.length === 0 || revealed.length < 2) return null;

  // Anchor every grab/drop on the first (top) winner seat — split pots
  // are rare in practice and the banner already itemises them.
  const winnerSeatIdx = winners[0]!.seatIndex;
  const winnerPos = seatPositions[winnerSeatIdx];
  if (!winnerPos) return null;

  const losers = revealed.filter(
    (r) => !winners.some((w) => w.seatIndex === r.seatIndex),
  );

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id="laserGlowRed" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="laserGlowGold" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {losers.map((l) => {
        const p = seatPositions[l.seatIndex];
        if (!p) return null;
        return (
          <g key={l.seatIndex}>
            {/* Red leg: Eye → loser. Croupier reaches out for the chips. */}
            <line
              x1={50}
              y1={50}
              x2={p.x}
              y2={p.y}
              stroke="#ef4444"
              strokeWidth={0.7}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              filter="url(#laserGlowRed)"
              className="laser-line"
            />
            {/* Gold leg: loser → winner. Chips delivered. */}
            <line
              x1={p.x}
              y1={p.y}
              x2={winnerPos.x}
              y2={winnerPos.y}
              stroke="#f5d067"
              strokeWidth={0.9}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              filter="url(#laserGlowGold)"
              className="laser-line laser-line--gold"
            />
          </g>
        );
      })}
    </svg>
  );
}
