'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { useSocket } from '@/hooks/useSocket';
import { getProfile, clearSession } from '@/lib/session';
import type { TableSummary } from '@neon-poker/shared/events';

export default function LobbyPage() {
  const router = useRouter();
  const { socket, status } = useSocket();
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [pending, setPending] = useState(false);
  const profile = typeof window !== 'undefined' ? getProfile() : null;

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
  }, [socket, router]);

  function logout() {
    clearSession();
    router.replace('/join');
  }

  async function join(t: TableSummary) {
    if (!socket) return;
    // find first free seat
    const seatIndex = 0; // server validates; in real UI player picks seat
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
    <main className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl text-glow-cyan text-neon-cyan">Lobby</h1>
          <p className="text-white/50 text-sm">
            Angemeldet als <span className="font-mono text-white/80">{profile?.handle}</span>
            {profile?.chips != null && (
              <>
                {' '}· <span className="text-neon-gold">{profile.chips.toLocaleString()} Chips</span>
              </>
            )}
            {' '}· Socket: <span className="text-white/40">{status}</span>
          </p>
        </div>
        <NeonButton variant="ghost" onClick={logout}>
          Abmelden
        </NeonButton>
      </header>

      {pending ? (
        <NeonCard glow="cyan" strong className="text-center">
          <h2 className="text-xl font-display mb-2">Account wartet auf Freigabe</h2>
          <p className="text-white/55 text-sm">
            Sobald der Admin deine Player-ID genehmigt hat, erscheinen hier die Tische.
          </p>
        </NeonCard>
      ) : tables.length === 0 ? (
        <NeonCard className="text-center">
          <p className="text-white/55">Aktuell sind keine Tische offen.</p>
        </NeonCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tables.map((t) => (
            <NeonCard key={t.id} glow="blue" className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-xl">{t.name}</h3>
                  <p className="text-white/50 text-xs font-mono mt-1">
                    SB {t.smallBlind} / BB {t.bigBlind} · Buy-in {t.buyIn.toLocaleString()}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-widest font-display px-2 py-1 rounded-md border ${
                    t.inHand
                      ? 'text-neon-pink border-neon-pink/40 bg-neon-pink/10'
                      : 'text-neon-green border-neon-green/40 bg-neon-green/10'
                  }`}
                >
                  {t.inHand ? 'Hand läuft' : 'Wartend'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">
                  Spieler {t.seated}/{t.maxPlayers}
                </span>
                <NeonButton
                  onClick={() => join(t)}
                  disabled={t.seated >= t.maxPlayers}
                >
                  Beitreten
                </NeonButton>
              </div>
            </NeonCard>
          ))}
        </div>
      )}
    </main>
  );
}
