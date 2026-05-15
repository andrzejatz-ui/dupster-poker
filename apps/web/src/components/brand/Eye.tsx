import clsx from 'clsx';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Almond-shaped sentinel eye. Flat SVG, monochrome gold and obsidian,
 * slightly Egyptian. Iris uses a radial gradient core→rim so the gold
 * reads as material, not flat colour. A subtle drop-shadow gives the
 * eye an antique-gold halo.
 */
export function Eye({ size = 32, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 60"
      width={size}
      height={(size * 60) / 100}
      role="img"
      aria-label="Sentinel eye"
      className={clsx('animate-amber-pulse', className)}
    >
      <defs>
        <radialGradient id="iris" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#3a2c08" />
          <stop offset="55%" stopColor="#7a5e1a" />
          <stop offset="92%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#5a4310" />
        </radialGradient>
        <radialGradient id="pupil" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#000000" />
          <stop offset="80%" stopColor="#050402" />
          <stop offset="100%" stopColor="#0c0a07" />
        </radialGradient>
      </defs>

      {/* Almond shell */}
      <path
        d="M 4 30 Q 25 8 50 8 Q 75 8 96 30 Q 75 52 50 52 Q 25 52 4 30 Z"
        fill="rgba(8,6,3,0.92)"
        stroke="rgba(212,175,55,0.55)"
        strokeWidth="0.8"
      />

      {/* Iris */}
      <circle cx="50" cy="30" r="14" fill="url(#iris)" />

      {/* Pupil */}
      <circle cx="50" cy="30" r="5.5" fill="url(#pupil)" />

      {/* Catchlight */}
      <circle cx="47.5" cy="27.5" r="1.1" fill="rgba(255,232,170,0.9)" />
    </svg>
  );
}
