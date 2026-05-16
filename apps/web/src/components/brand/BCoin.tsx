import clsx from 'clsx';

interface Props {
  className?: string;
}

/**
 * Bluffuminati chip sigil — a capital B with a vertical stroke
 * through its centre, the brand's answer to the $ sign. Used as the
 * currency symbol next to wallet / pot amounts and as the lead
 * glyph in the BLUFFUMINATI wordmark so the typography reads
 * "this is THE currency of the room".
 *
 * Implementation: the B comes from the surrounding font (so it
 * always matches weight + tracking of the parent text), the stroke
 * is a positioned ::after pseudo. Both colours track currentColor
 * — set text-gold on the parent and you get a gold B with a gold
 * bar, set text-status-alert and the whole sigil turns red. All
 * sizing is em-based so it scales with font-size without any prop.
 */
export function BCoin({ className }: Props) {
  return (
    <span
      className={clsx(
        'bcoin inline-block relative font-display font-extrabold align-baseline leading-none',
        className,
      )}
      aria-label="Bluffuminati chip"
    >
      B
    </span>
  );
}
