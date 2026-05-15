import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Kept for backward-compat with old neon variants — all map to gold. */
  glow?: 'blue' | 'cyan' | 'violet' | 'gold' | null;
  strong?: boolean;
  children: ReactNode;
}

/**
 * Obsidian surface with a refined gold rim. The `glow` prop is still
 * accepted for back-compat with pages that pass `glow="cyan"` etc., but
 * the rendering is always the same single gold accent — strict
 * monochrome shell is the design rule.
 */
export function NeonCard({ glow = null, strong = false, className, children, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={clsx(
        strong ? 'surface-strong' : 'surface',
        'rounded-2xl p-6 relative overflow-hidden',
        glow && 'shadow-gold-soft',
        className,
      )}
    >
      {/* faint top-edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
}
