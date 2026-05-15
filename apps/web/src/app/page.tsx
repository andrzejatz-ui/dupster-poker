'use client';

import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { Mask } from '@/components/brand/Mask';
import { Signature } from '@/components/ui/Signature';
import { useT } from '@/i18n/context';

export default function Landing() {
  const t = useT();
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-3xl w-full">
        {/* Sigil */}
        <div className="flex justify-center mb-8">
          <Mask size={128} />
        </div>

        <div className="text-center mb-10">
          <span className="inline-block text-[10px] uppercase tracking-[0.4em] text-ink-muted font-display">
            {t('landing.tagline')}
          </span>
          <h1 className="mt-4 font-display text-5xl md:text-6xl font-extrabold tracking-[0.18em] text-gold text-glow-gold">
            {t('landing.titleA')}
            {t('landing.titleB') ? <> {t('landing.titleB')}</> : null}
          </h1>
          <p className="mt-4 text-ink-secondary max-w-xl mx-auto">{t('landing.intro')}</p>
        </div>

        <NeonCard glow="gold" strong className="text-center">
          <h2 className="font-display text-2xl mb-2 text-ink-primary">{t('landing.welcome')}</h2>
          <p className="text-ink-secondary text-sm mb-6">{t('landing.welcomeBody')}</p>
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

        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-ink-muted mt-8 font-mono">
          {t('landing.build')}
        </p>
        <Signature className="mt-3" />
      </div>
    </main>
  );
}
