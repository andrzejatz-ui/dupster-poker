'use client';

import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { Eye } from '@/components/brand/Eye';
import { Signature } from '@/components/ui/Signature';
import { useT } from '@/i18n/context';

export default function Landing() {
  const t = useT();
  return (
    <main className="viewport-fit flex items-center justify-center px-4 py-4 sm:py-6">
      <div className="relative z-10 max-w-3xl w-full">
        <div className="flex justify-center mb-3 sm:mb-5">
          <Eye size={140} />
        </div>

        <div className="text-center mb-4 sm:mb-6">
          <span className="inline-block text-[10px] uppercase tracking-[0.4em] text-ink-muted font-display">
            {t('landing.tagline')}
          </span>
          <h1 className="mt-2 font-display text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-[0.18em] text-gold text-glow-gold">
            {t('landing.titleA')}
            {t('landing.titleB') ? <> {t('landing.titleB')}</> : null}
          </h1>
          <p className="mt-2 sm:mt-3 text-ink-secondary text-sm sm:text-base max-w-xl mx-auto">{t('landing.intro')}</p>
        </div>

        <NeonCard glow="gold" strong className="text-center">
          <h2 className="font-display text-xl sm:text-2xl mb-1 sm:mb-2 text-ink-primary">{t('landing.welcome')}</h2>
          <p className="text-ink-secondary text-xs sm:text-sm mb-4 sm:mb-5">{t('landing.welcomeBody')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/join">
              <NeonButton variant="gold" size="lg">
                {t('landing.primaryCta')}
              </NeonButton>
            </Link>
            <Link href="/admin/login">
              <NeonButton variant="ghost" size="lg">
                {t('landing.adminCta')}
              </NeonButton>
            </Link>
          </div>
        </NeonCard>

        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-ink-muted mt-3 sm:mt-5 font-mono">
          {t('landing.build')}
        </p>
        <Signature className="mt-2" />
      </div>
    </main>
  );
}
