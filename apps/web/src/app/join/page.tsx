'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { joinAsPlayer } from '@/lib/api';
import { setSession } from '@/lib/session';
import { useT } from '@/i18n/context';

// `useSearchParams` triggers a CSR bail during static export unless it
// sits inside a Suspense boundary. Wrap the form in one.
export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}

function JoinForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const inviteCode = params.get('invite') ?? null;

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'pending' | 'banned'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (handle.trim().length < 2) {
      setError(t('join.errors.invalidId'));
      return;
    }
    setPhase('submitting');
    const { status, body } = await joinAsPlayer(handle.trim(), displayName.trim() || undefined);
    if (status === 200 && body.token) {
      setSession(body.token, body.profile);
      router.replace('/lobby');
      return;
    }
    if (status === 202) {
      setPhase('pending');
      return;
    }
    if (status === 403) {
      setPhase('banned');
      return;
    }
    setPhase('idle');
    setError(body.error ?? t('join.errors.unknown'));
  }

  if (phase === 'pending') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-12">
        <NeonCard glow="cyan" strong className="max-w-md w-full text-center">
          <h1 className="font-display text-2xl text-glow-cyan text-neon-cyan mb-3">
            {t('join.pending.title')}
          </h1>
          <p className="text-white/60 text-sm mb-6">{t('join.pending.body')}</p>
          <NeonButton variant="ghost" onClick={() => setPhase('idle')}>
            {t('common.back')}
          </NeonButton>
        </NeonCard>
      </main>
    );
  }

  if (phase === 'banned') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-12">
        <NeonCard glow={null} strong className="max-w-md w-full text-center">
          <h1 className="font-display text-2xl text-rose-300 mb-3">{t('join.banned.title')}</h1>
          <p className="text-white/60 text-sm">{t('join.banned.body')}</p>
        </NeonCard>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <NeonCard glow="violet" strong className="max-w-md w-full">
        <div className="mb-6">
          <span className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-display">
            {inviteCode ? `${t('join.invitePrefix')} · ${inviteCode}` : t('join.privateAccess')}
          </span>
          <h1 className="font-display text-3xl mt-2 text-glow-violet text-neon-violet">
            {t('join.title')}
          </h1>
          <p className="text-white/55 text-sm mt-2">{t('join.body')}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <NeonInput
            id="player-handle"
            label={t('join.idLabel')}
            placeholder={t('join.idPlaceholder')}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            autoFocus
            autoComplete="off"
            error={error}
          />
          <NeonInput
            id="player-display"
            label={t('join.nameLabel')}
            placeholder={t('join.namePlaceholder')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            hint={t('join.nameHint')}
          />
          <NeonButton
            type="submit"
            variant="primary"
            size="lg"
            disabled={phase === 'submitting'}
            className="w-full"
          >
            {phase === 'submitting' ? t('join.submitting') : t('join.submit')}
          </NeonButton>
        </form>
      </NeonCard>
    </main>
  );
}
