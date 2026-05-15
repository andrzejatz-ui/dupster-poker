'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { useSocket } from '@/hooks/useSocket';
import { getProfile, clearSession } from '@/lib/session';
import { Signature } from '@/components/ui/Signature';
import { useT } from '@/i18n/context';
import type { TableSummary } from '@neon-poker/shared/events';

export default function LobbyPage() {
  const t = useT();
  const router = useRouter();
  const { socket, status } = useSocket();
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [pending, setPending] = useState(false);
  const initial = typeof window !== 'undefined' ? getProfile() : null;
  const [profile, setProfile] = useState(initial);

  useEffect(() => {
    if (!socket) return;
    socket.on('server:hello', (hello) => {
      if (hello.status === 'pending') setPending(true);
      if (hello.status === 'banned') {
        clearSession();
        router.replace('/join');
      }
    });
    socket.on('server:lobby:tables', (p) => setTables(p.tables));
    socket.emit('client:lobby:list', (r) => setTables(r.tables));

    // Live chip balance updates pushed from the server when the admin
    // grants / sets chips.
    socket.on('server:account:chip_update', (p) => {
      setProfile((cur) => {
        if (!cur) return cur;
        const next = { ...cur, chips: p.chips };
        try {
          window.sessionStorage.setItem('np_profile', JSON.stringify(next));
        } catch {}
        return next;
      });
    });

    // Banned mid-session → clear and bounce back to /join.
    socket.on('server:account:banned', () => {
      clearSession();
      router.replace('/join');
    });
  }, [socket, router]);

  function logout() {
    clearSession();
    router.replace('/join');
  }

  async function join(t: TableSummary) {
    if (!socket) return;
    const seatIndex = 0;
    socket.emit(
      'client:lobby:join',
      { tableId: t.id, seatIndex },
      (res) => {
        if (res.ok) router.push(`/table/${t.id}`);
        else alert(res.error);
      },
    );
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-8 sm:mb-10 pr-24 sm:pr-36">
        <div>
          <h1 className="font-display text-3xl text-gold text-glow-gold">{t('lobby.title')}</h1>
          <p className="text-white/50 text-sm">
            {t('lobby.signedInAs')} <span className="font-mono text-white/80">{profile?.handle}</span>
            {profile?.chips != null && (
              <>
                {' '}· <span className="text-gold">
                  {profile.chips.toLocaleString()} {t('lobby.chipsSuffix')}
                </span>
              </>
            )}
            {' '}· {t('lobby.socketStatus')}: <span className="text-white/40">{status}</span>
          </p>
        </div>
        <NeonButton variant="ghost" onClick={logout}>
          {t('common.signOut')}
        </NeonButton>
      </header>

      {pending ? (
        <NeonCard glow="cyan" strong className="text-center">
          <h2 className="text-xl font-display mb-2">{t('lobby.pending.title')}</h2>
          <p className="text-white/55 text-sm">{t('lobby.pending.body')}</p>
        </NeonCard>
      ) : tables.length === 0 ? (
        <NeonCard className="text-center">
          <p className="text-white/55">{t('lobby.empty')}</p>
        </NeonCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tables.map((tbl) => (
            <NeonCard key={tbl.id} glow="blue" className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-xl">{tbl.name}</h3>
                  <p className="text-white/50 text-xs font-mono mt-1">
                    SB {tbl.smallBlind} / BB {tbl.bigBlind} · {t('lobby.buyIn')} {tbl.buyIn.toLocaleString()}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-widest font-display px-2 py-1 rounded-md border ${
                    tbl.inHand
                      ? 'text-status-alert border-status-alert/40 bg-status-alert/10'
                      : 'text-status-success border-status-success/40 bg-status-success/10'
                  }`}
                >
                  {tbl.inHand ? t('lobby.inHand') : t('lobby.waiting')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">
                  {t('lobby.playersCount')} {tbl.seated}/{tbl.maxPlayers}
                </span>
                <NeonButton
                  onClick={() => join(tbl)}
                  disabled={tbl.seated >= tbl.maxPlayers}
                >
                  {t('lobby.join')}
                </NeonButton>
              </div>
            </NeonCard>
          ))}
        </div>
      )}
      <Signature className="mt-10 pb-6" />
    </main>
  );
}
