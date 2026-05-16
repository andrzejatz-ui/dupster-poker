import clsx from 'clsx';

interface Props {
  className?: string;
}

/**
 * Bluffuminati chip sigil — renders Unicode ₿ (U+20BF, BITCOIN SIGN),
 * which Inter Extra-Bold ships with at the exact same metrics +
 * weight as its neighbouring capitals. That keeps the
 * "B|LUFFUMINATI" wordmark perfectly aligned without any custom
 * stroke-overlay hackery, and the same component drops cleanly into
 * wallet amounts as a currency symbol.
 *
 * currentColor + em sizing — no props beyond className. Set the
 * parent's text-* colour and font-size and the sigil scales with it.
 */
export function BCoin({ className }: Props) {
  return (
    <span
      className={clsx(
        'inline-block font-display font-extrabold align-baseline leading-none',
        className,
      )}
      aria-label="Bluffuminati chip"
    >
      ₿
    </span>
  );
}
