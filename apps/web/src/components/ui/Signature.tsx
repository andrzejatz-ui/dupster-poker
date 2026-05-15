import clsx from 'clsx';

interface Props {
  className?: string;
}

/**
 * Small, quiet attribution line rendered at the bottom of pages.
 * Locale-independent — the company name is invariant.
 */
export function Signature({ className }: Props) {
  return (
    <div
      className={clsx(
        'text-center text-[10px] font-mono tracking-[0.4em] text-ink-muted/70 select-none',
        className,
      )}
    >
      <span className="text-gold/60">filipOS</span>
      <span className="text-ink-muted/40">.arch</span>
    </div>
  );
}
