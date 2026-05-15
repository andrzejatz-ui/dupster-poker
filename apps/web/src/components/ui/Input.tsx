import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
}

export const NeonInput = forwardRef<HTMLInputElement, Props>(
  ({ label, hint, error, className, id, ...rest }, ref) => {
    return (
      <label htmlFor={id} className="block">
        {label && (
          <span className="block mb-2 text-xs uppercase tracking-[0.18em] text-white/60 font-display">
            {label}
          </span>
        )}
        <input
          id={id}
          ref={ref}
          {...rest}
          className={clsx(
            'w-full px-4 py-3 rounded-xl bg-ink-900/80 border text-white placeholder-white/30',
            'focus:outline-none transition-all duration-150',
            error
              ? 'border-rose-400/60 focus:shadow-[0_0_18px_rgba(244,63,94,0.45)]'
              : 'border-white/10 focus:border-neon-cyan/60 focus:shadow-neon-cyan',
            className,
          )}
        />
        {error ? (
          <span className="block mt-2 text-xs text-rose-300">{error}</span>
        ) : hint ? (
          <span className="block mt-2 text-xs text-white/40">{hint}</span>
        ) : null}
      </label>
    );
  },
);
NeonInput.displayName = 'NeonInput';
