import clsx from 'clsx';

interface Props {
  className?: string;
}

/**
 * Two-line brand footer for the bottom of public surfaces (landing,
 * /join, /lobby). Tradenamed ecosystem line + copyright. Lives below
 * the Signature so the page ends with the strongest brand statement
 * regardless of viewport height.
 */
export function BrandFooter({ className }: Props) {
  return (
    <div
      className={clsx(
        'text-center text-[10px] sm:text-[11px] leading-relaxed text-ink-muted/75 select-none px-3',
        className,
      )}
    >
      <div>
        Bluffuminati™ is part of the{' '}
        <span className="text-gold/70">Gripsuminati AI Ecosystem</span>.
      </div>
      <div className="text-ink-muted/55">
        © 2026 Bluffuminati Technologies Group.
      </div>
    </div>
  );
}
