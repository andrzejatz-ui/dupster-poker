import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'gold';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

/**
 * Obsidian + antique-gold button. Variants:
 *   primary | gold  → gold accent (primary CTAs)
 *   ghost           → quiet, cool border
 *   danger          → status alert red
 */
const variants: Record<Variant, string> = {
  primary:
    'bg-gold/[0.06] border-gold/40 text-gold ' +
    'hover:bg-gold/[0.10] hover:border-gold/60 hover:shadow-gold-soft active:translate-y-px',
  gold:
    'bg-gold/[0.08] border-gold/55 text-gold ' +
    'hover:bg-gold/[0.14] hover:border-gold hover:shadow-gold-strong active:translate-y-px',
  ghost:
    'bg-white/[0.02] border-white/10 text-ink-secondary ' +
    'hover:bg-white/[0.06] hover:text-ink-primary hover:border-white/25',
  danger:
    'bg-status-alert/10 border-status-alert/45 text-status-alert ' +
    'hover:bg-status-alert/15 hover:border-status-alert/70',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-md tracking-wider',
  md: 'px-5 py-2.5 text-sm rounded-lg tracking-wider',
  lg: 'px-7 py-3.5 text-sm rounded-lg tracking-[0.18em]',
};

export function NeonButton({ variant = 'primary', size = 'md', className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-display font-medium uppercase border',
        'transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
