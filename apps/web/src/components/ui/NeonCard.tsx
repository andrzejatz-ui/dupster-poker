import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  glow?: 'blue' | 'cyan' | 'violet' | null;
  strong?: boolean;
  children: ReactNode;
}

export function NeonCard({ glow = null, strong = false, className, children, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={clsx(
        strong ? 'glass-strong' : 'glass',
        'rounded-2xl shadow-glass-lg p-6 relative overflow-hidden',
        glow === 'blue' && 'shadow-neon-blue',
        glow === 'cyan' && 'shadow-neon-cyan',
        glow === 'violet' && 'shadow-neon-violet',
        className,
      )}
    >
      <div className="absolute inset-0 pointer-events-none opacity-50 bg-gradient-to-br from-white/5 via-transparent to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
}
