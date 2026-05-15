'use client';

/**
 * Slithering gold serpent for the login page. Pure SVG, animated via
 * CSS keyframes in globals.css (snakeSlither + snakeSlitherTwo). The
 * snake is rendered behind the form (z-0) and uses pointer-events:none
 * so it never blocks the input. Two paths weave at slightly different
 * speeds so the motion never looks mechanical.
 */
export function Snake() {
  return (
    <svg
      className="snake-canvas pointer-events-none fixed inset-0 w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id="snakeBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <linearGradient id="snakeGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a5e10" stopOpacity="0" />
          <stop offset="35%" stopColor="#d4af37" stopOpacity="1" />
          <stop offset="65%" stopColor="#f5d067" stopOpacity="1" />
          <stop offset="100%" stopColor="#7a5e10" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Upper serpentine: weaves across the top third */}
      <path
        d="M -8 22 C 12 4, 28 42, 50 22 S 84 4, 108 24"
        fill="none"
        stroke="rgba(212,175,55,0.35)"
        strokeWidth="3.2"
        strokeLinecap="round"
        filter="url(#snakeBlur)"
        vectorEffect="non-scaling-stroke"
        className="snake-trail snake-trail--a"
      />
      <path
        d="M -8 22 C 12 4, 28 42, 50 22 S 84 4, 108 24"
        fill="none"
        stroke="url(#snakeGold)"
        strokeWidth="1.4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="snake-body snake-body--a"
      />

      {/* Lower serpentine: counter-curves through the bottom third */}
      <path
        d="M 108 78 C 88 96, 72 60, 50 80 S 16 98, -8 76"
        fill="none"
        stroke="rgba(212,175,55,0.30)"
        strokeWidth="2.8"
        strokeLinecap="round"
        filter="url(#snakeBlur)"
        vectorEffect="non-scaling-stroke"
        className="snake-trail snake-trail--b"
      />
      <path
        d="M 108 78 C 88 96, 72 60, 50 80 S 16 98, -8 76"
        fill="none"
        stroke="url(#snakeGold)"
        strokeWidth="1.2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="snake-body snake-body--b"
      />
    </svg>
  );
}
