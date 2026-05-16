'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { Eye } from '@/components/brand/Eye';
import { Signature } from '@/components/ui/Signature';
import { joinAsPlayer } from '@/lib/api';
import { setSession, recallAvatar } from '@/lib/session';
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
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'pending' | 'banned'>('idle');

  // Show the player's saved avatar as soon as they type their handle —
  // gives the "yes this is your account" cue before login completes.
  const cachedAvatar = useMemo(
    () => (handle.trim().length >= 2 ? recallAvatar(handle) : null),
    [handle],
  );

  // Latest values, so the polling effect uses fresh input without restarting.
  const handleRef = useRef(handle);
  const passwordRef = useRef(password);
  const nameRef = useRef(displayName);
  useEffect(() => { handleRef.current = handle; }, [handle]);
  useEffect(() => { passwordRef.current = password; }, [password]);
  useEffect(() => { nameRef.current = displayName; }, [displayName]);

  useEffect(() => {
    if (phase !== 'pending') return;
    let cancelled = false;
    const id = setInterval(async () => {
      const h = handleRef.current.trim();
      const p = passwordRef.current;
      if (!h || !p) return;
      const { status, body } = await joinAsPlayer(h, p, nameRef.current.trim() || undefined);
      if (cancelled) return;
      if (status === 200 && body.token) {
        setSession(body.token, body.profile);
        router.replace('/lobby');
        return;
      }
      if (status === 403) setPhase('banned');
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (handle.trim().length < 2) {
      setError(t('join.errors.invalidId'));
      return;
    }
    if (password.length < 4) {
      setError(t('join.errors.invalidPassword'));
      return;
    }
    setPhase('submitting');
    const { status, body } = await joinAsPlayer(
      handle.trim(),
      password,
      displayName.trim() || undefined,
    );
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
    if (status === 401) {
      setError(t('join.errors.wrongPassword'));
      return;
    }
    if (status === 409) {
      setError(t('join.errors.passwordNotSet'));
      return;
    }
    setError(body.error ?? t('join.errors.unknown'));
  }

  if (phase === 'pending') {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-6 overflow-y-auto">
        <NeonCard glow="gold" strong className="relative z-10 max-w-md w-full text-center">
          <div className="flex justify-center mb-4 opacity-90">
            <Eye size={96} />
          </div>
          <h1 className="font-display text-2xl text-gold text-glow-gold mb-3">
            {t('join.pending.title')}
          </h1>
          <p className="text-ink-secondary text-sm mb-3">{t('join.pending.body')}</p>
          <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-muted mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-amber-pulse" />
            auto
          </div>
          <NeonButton variant="ghost" onClick={() => setPhase('idle')}>
            {t('common.back')}
          </NeonButton>
        </NeonCard>
      </main>
    );
  }

  if (phase === 'banned') {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-6 overflow-y-auto">
        <NeonCard glow={null} strong className="relative z-10 max-w-md w-full text-center">
          <h1 className="font-display text-2xl text-status-alert mb-3">{t('join.banned.title')}</h1>
          <p className="text-ink-secondary text-sm">{t('join.banned.body')}</p>
        </NeonCard>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-start sm:justify-center px-4 py-4 sm:py-6 overflow-y-auto">
      <div className="relative z-10 max-w-md w-full mb-2 flex justify-between items-center gap-3">
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.22em] text-ink-muted hover:text-gold transition-colors font-display"
        >
          ← {t('common.back')}
        </Link>
        <div className="opacity-80 shrink-0">
          <Eye size={28} />
        </div>
      </div>
      <NeonCard glow="gold" strong className="relative z-10 max-w-md w-full">
        <div className="mb-4 sm:mb-5 flex items-start gap-3">
          {/* Cached avatar appears as soon as the handle matches a known
              player — visual confirmation that the picture survived
              their last sign-out. */}
          {cachedAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cachedAvatar}
              alt=""
              className="shrink-0 w-12 h-12 rounded-full object-cover border border-rim-bright"
            />
          ) : (
            <div className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center surface-strong">
              <Eye size={36} />
            </div>
          )}
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-[0.4em] text-ink-muted font-display">
              {inviteCode ? `${t('join.invitePrefix')} · ${inviteCode}` : t('join.privateAccess')}
            </span>
            <h1 className="font-display text-2xl sm:text-3xl mt-1 text-gold text-glow-gold leading-tight">
              {t('join.title')}
            </h1>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 sm:space-y-4">
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
            id="player-password"
            label={t('join.passwordLabel')}
            placeholder={t('join.passwordPlaceholder')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            hint={t('join.passwordHint')}
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
      <Signature className="relative z-10 mt-3" />
    </main>
  );
}
