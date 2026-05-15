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
          <span className="block mb-2 text-[10px] uppercase tracking-[0.22em] text-ink-muted font-display">
            {label}
          </span>
        )}
        <input
          id={id}
          ref={ref}
          {...rest}
          className={clsx(
            'w-full px-4 py-3 rounded-md bg-obsidian-soft border text-ink-primary placeholder-ink-muted',
            'focus:outline-none transition-all duration-150',
            error
              ? 'border-status-alert/50 focus:border-status-alert focus:shadow-[0_0_18px_rgba(192,57,43,0.30)]'
              : 'border-rim-bright focus:border-gold focus:shadow-gold-soft',
            className,
          )}
        />
        {error ? (
          <span className="block mt-2 text-xs text-status-alert">{error}</span>
        ) : hint ? (
          <span className="block mt-2 text-xs text-ink-muted">{hint}</span>
        ) : null}
      </label>
    );
  },
);
NeonInput.displayName = 'NeonInput';
