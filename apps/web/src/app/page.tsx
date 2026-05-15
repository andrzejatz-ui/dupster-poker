'use client';

import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { useT } from '@/i18n/context';

export default function Landing() {
  const t = useT();
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-10">
          <span className="inline-block text-xs uppercase tracking-[0.4em] text-neon-cyan/80 font-display">
            {t('landing.tagline')}
          </span>
          <h1 className="mt-4 font-display text-5xl md:text-6xl font-bold tracking-tight">
            <span className="text-glow-violet text-neon-violet">{t('landing.titleA')}</span>{' '}
            <span className="text-glow-cyan text-neon-cyan">{t('landing.titleB')}</span>
          </h1>
          <p className="mt-4 text-white/60 max-w-xl mx-auto">{t('landing.intro')}</p>
        </div>

        <NeonCard glow="violet" strong className="text-center">
          <h2 className="font-display text-2xl mb-2">{t('landing.welcome')}</h2>
          <p className="text-white/55 text-sm mb-6">{t('landing.welcomeBody')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/join">
              <NeonButton variant="primary" size="lg">
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

        <p className="text-center text-xs text-white/30 mt-8 font-mono">
          {t('landing.build')}
        </p>
      </div>
    </main>
  );
}
