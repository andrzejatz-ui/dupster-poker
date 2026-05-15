import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'gold';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-neon-blue/20 via-transparent to-neon-violet/20 ' +
    'border-neon-blue/60 text-neon-blue text-glow-blue ' +
    'hover:shadow-neon-blue hover:border-neon-blue active:translate-y-px',
  ghost:
    'bg-white/5 border-white/15 text-white/80 hover:bg-white/10 hover:border-white/30',
  danger:
    'bg-rose-500/10 border-rose-400/50 text-rose-300 hover:border-rose-300 hover:shadow-[0_0_20px_rgba(244,63,94,0.4)]',
  gold:
    'bg-gradient-to-br from-neon-gold/20 via-transparent to-neon-pink/20 border-neon-gold/60 ' +
    'text-neon-gold hover:shadow-[0_0_22px_rgba(255,209,102,0.45)]',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-7 py-3.5 text-base rounded-xl',
};

export function NeonButton({ variant = 'primary', size = 'md', className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-2 border font-display font-semibold tracking-wide',
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
