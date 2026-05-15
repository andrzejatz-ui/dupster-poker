import clsx from 'clsx';

interface Props {
  size?: number;
  className?: string;
  glow?: boolean;
}

/**
 * Minimalist Guy-Fawkes / Anonymous mask emblem.
 *
 * Pure stroke geometry, no fill on the face shape. 0.8-px equivalent
 * strokes at the design size, scales cleanly to favicon (32px). The
 * almond eye cut-outs echo the standalone Eye sigil so the mask reads
 * as part of the same design language.
 */
export function Mask({ size = 96, className, glow = true }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 120"
      width={size}
      height={(size * 120) / 100}
      role="img"
      aria-label="Anonymous mask sigil"
      className={clsx(glow && 'sigil-glow', className)}
    >
      {/* Halo */}
      <defs>
        <radialGradient id="mask-halo" cx="50%" cy="48%" r="55%">
          <stop offset="0%" stopColor="rgba(212,175,55,0.18)" />
          <stop offset="60%" stopColor="rgba(212,175,55,0.04)" />
          <stop offset="100%" stopColor="rgba(212,175,55,0)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="58" r="48" fill="url(#mask-halo)" />

      <g
        fill="none"
        stroke="#d4af37"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Face outline — pointed chin */}
        <path d="M 50 6
                 C 26 8 12 26 12 50
                 C 12 70 22 90 36 102
                 L 50 112
                 L 64 102
                 C 78 90 88 70 88 50
                 C 88 26 74 8 50 6 Z" />

        {/* Eyebrows — narrow shaped */}
        <path d="M 22 36 Q 30 30 40 34" />
        <path d="M 60 34 Q 70 30 78 36" />

        {/* Cheek lines — arched */}
        <path d="M 16 52 Q 26 70 38 80" />
        <path d="M 84 52 Q 74 70 62 80" />

        {/* Handlebar moustache */}
        <path d="M 30 78
                 Q 38 76 44 80
                 Q 50 84 50 84
                 Q 50 84 56 80
                 Q 62 76 70 78" />
        <path d="M 32 80 Q 28 84 26 82" />
        <path d="M 68 80 Q 72 84 74 82" />

        {/* Goatee — pointed chin tuft */}
        <path d="M 44 92 Q 50 102 56 92 Q 52 100 50 106 Q 48 100 44 92 Z" />

        {/* Almond eye cut-outs */}
        <path d="M 24 50
                 Q 32 44 42 50
                 Q 32 56 24 50 Z" fill="#09090b" />
        <path d="M 58 50
                 Q 68 44 76 50
                 Q 68 56 58 50 Z" fill="#09090b" />
      </g>
    </svg>
  );
}
