'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { joinAsPlayer } from '@/lib/api';
import { setSession } from '@/lib/session';

export default function JoinPage() {
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
      setError('Bitte gib eine gültige Player-ID ein.');
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
    setError(body.error ?? 'Unbekannter Fehler.');
  }

  if (phase === 'pending') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-12">
        <NeonCard glow="cyan" strong className="max-w-md w-full text-center">
          <h1 className="font-display text-2xl text-glow-cyan text-neon-cyan mb-3">
            Warten auf Freigabe
          </h1>
          <p className="text-white/60 text-sm mb-6">
            Deine Player-ID liegt jetzt beim Admin. Sobald sie freigegeben ist,
            kannst du hier mit derselben ID erneut beitreten.
          </p>
          <NeonButton variant="ghost" onClick={() => setPhase('idle')}>
            Zurück
          </NeonButton>
        </NeonCard>
      </main>
    );
  }

  if (phase === 'banned') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-12">
        <NeonCard glow={null} strong className="max-w-md w-full text-center">
          <h1 className="font-display text-2xl text-rose-300 mb-3">Zugang gesperrt</h1>
          <p className="text-white/60 text-sm">
            Diese Player-ID ist aktuell nicht spielberechtigt.
          </p>
        </NeonCard>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <NeonCard glow="violet" strong className="max-w-md w-full">
        <div className="mb-6">
          <span className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-display">
            {inviteCode ? `Invite · ${inviteCode}` : 'Privater Zugang'}
          </span>
          <h1 className="font-display text-3xl mt-2 text-glow-violet text-neon-violet">
            Player-ID
          </h1>
          <p className="text-white/55 text-sm mt-2">
            Tippe deine ID exakt so ein, wie der Admin sie dir genannt hat.
            Sie wird nicht gespeichert — bei nächstem Besuch erneut nötig.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <NeonInput
            id="player-handle"
            label="Player-ID"
            placeholder="z.B. king_of_clubs"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            autoFocus
            autoComplete="off"
            error={error}
          />
          <NeonInput
            id="player-display"
            label="Anzeigename (optional)"
            placeholder="Wird am Tisch gezeigt"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            hint="Leer lassen, um die Player-ID als Name zu nutzen."
          />
          <NeonButton
            type="submit"
            variant="primary"
            size="lg"
            disabled={phase === 'submitting'}
            className="w-full"
          >
            {phase === 'submitting' ? 'Prüfe …' : 'Eintreten'}
          </NeonButton>
        </form>
      </NeonCard>
    </main>
  );
}
