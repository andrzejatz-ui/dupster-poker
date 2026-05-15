'use client';

import clsx from 'clsx';
import { useI18n } from '@/i18n/context';
import { LOCALES, LOCALE_LABEL, type Locale } from '@/i18n/dict';

interface Props {
  className?: string;
}

export function LanguageSwitcher({ className }: Props) {
  const { locale, setLocale } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className={clsx(
        'inline-flex glass rounded-full p-1 gap-0.5 text-[11px] font-display tracking-widest',
        className,
      )}
    >
      {LOCALES.map((l: Locale) => {
        const active = locale === l;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(l)}
            className={clsx(
              'px-2.5 py-1 rounded-full transition-colors',
              active
                ? 'bg-neon-cyan/15 text-neon-cyan text-glow-cyan border border-neon-cyan/40'
                : 'text-white/50 hover:text-white/80 border border-transparent',
            )}
          >
            {LOCALE_LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}

/** Fixed top-right placement for pages that don't have their own header. */
export function LanguageSwitcherCorner() {
  return (
    <div className="fixed top-4 right-4 z-50">
      <LanguageSwitcher />
    </div>
  );
}
