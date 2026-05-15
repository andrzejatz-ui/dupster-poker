'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { adminCall, clearAdminToken, getAdminToken } from '@/lib/admin';

interface PlayerRow {
  id: string;
  player_handle: string;
  display_name: string | null;
  status: 'pending' | 'approved' | 'banned';
  chips: string;
  created_at: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [pending, setPending] = useState<PlayerRow[]>([]);
  const [approved, setApproved] = useState<PlayerRow[]>([]);
  const [banned, setBanned] = useState<PlayerRow[]>([]);
  const [tables, setTables] = useState<any[]>([]);

  useEffect(() => {
    if (!getAdminToken()) router.replace('/admin/login');
    refresh();
  }, [router]);

  async function refresh() {
    try {
      const a = await adminCall('/players?status=pending');
      const b = await adminCall('/players?status=approved');
      const c = await adminCall('/players?status=banned');
      const t = await adminCall('/tables');
      if (a.status === 401) { clearAdminToken(); router.replace('/admin/login'); return; }
      setPending(a.body.players ?? []);
      setApproved(b.body.players ?? []);
      setBanned(c.body.players ?? []);
      setTables(t.body.tables ?? []);
    } catch (err) {
      console.error(err);
    }
  }

  async function approve(id: string) {
    const initialChips = Number(prompt('Initiale Chips (0 für keine):', '5000') ?? '0');
    await adminCall(`/players/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ initialChips: isFinite(initialChips) ? initialChips : 0 }),
    });
    refresh();
  }

  async function reject(id: string) {
    if (!confirm('Diese Anfrage ablehnen?')) return;
    await adminCall(`/players/${id}/reject`, { method: 'POST' });
    refresh();
  }

  async function adjustChips(id: string, currentChips: string) {
    const delta = Number(prompt(`Aktuell ${currentChips} — Δ (+/-):`, '1000') ?? '');
    if (!isFinite(delta) || delta === 0) return;
    await adminCall(`/players/${id}/chips`, {
      method: 'POST',
      body: JSON.stringify({
        delta,
        reason: delta > 0 ? 'admin_grant' : 'admin_revoke',
        note: 'manual adjust',
      }),
    });
    refresh();
  }

  async function toggleBan(p: PlayerRow) {
    if (p.status === 'banned') {
      await adminCall(`/players/${p.id}/unban`, { method: 'POST' });
    } else {
      const reason = prompt('Grund:', '') ?? null;
      await adminCall(`/players/${p.id}/ban`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    }
    refresh();
  }

  async function createTable() {
    const name = prompt('Tischname:', 'Neon Table') ?? '';
    if (!name) return;
    const sb = Number(prompt('Small blind:', '10') ?? '');
    const bb = Number(prompt('Big blind:', '20') ?? '');
    const buyIn = Number(prompt('Buy-in:', '1000') ?? '');
    const maxPlayers = Number(prompt('Max Spieler (2–9):', '6') ?? '');
    const r = await adminCall('/tables', {
      method: 'POST',
      body: JSON.stringify({
        name,
        smallBlind: sb,
        bigBlind: bb,
        buyIn,
        maxPlayers,
        allowSpectators: false,
      }),
    });
    if (r.status !== 200) alert(`Fehler: ${r.body.error}`);
    refresh();
  }

  function logout() {
    clearAdminToken();
    router.replace('/admin/login');
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-glow-violet text-neon-violet">
            Admin Dashboard
          </h1>
          <p className="text-white/50 text-xs">
            Pending {pending.length} · Approved {approved.length} · Banned {banned.length} · Tische {tables.length}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/audit"><NeonButton variant="ghost" size="sm">Audit-Log</NeonButton></Link>
          <NeonButton variant="ghost" size="sm" onClick={logout}>Logout</NeonButton>
        </div>
      </header>

      {/* Pending */}
      <NeonCard glow="cyan">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-glow-cyan text-neon-cyan">Pending Approvals</h2>
          <span className="text-xs text-white/40 font-mono">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-white/40 text-sm">Keine offenen Anfragen.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs uppercase tracking-widest">
                <th className="py-2">Handle</th>
                <th>Display</th>
                <th>Beigetreten</th>
                <th className="text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="py-2 font-mono">{p.player_handle}</td>
                  <td className="text-white/70">{p.display_name ?? '—'}</td>
                  <td className="text-white/40 font-mono">{new Date(p.created_at).toLocaleString()}</td>
                  <td className="text-right space-x-2">
                    <NeonButton size="sm" variant="primary" onClick={() => approve(p.id)}>
                      Approve
                    </NeonButton>
                    <NeonButton size="sm" variant="danger" onClick={() => reject(p.id)}>
                      Reject
                    </NeonButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </NeonCard>

      {/* Approved */}
      <NeonCard glow="blue">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Spieler</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 text-xs uppercase tracking-widest">
              <th className="py-2">Handle</th>
              <th>Status</th>
              <th className="text-right">Chips</th>
              <th className="text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {[...approved, ...banned].map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="py-2 font-mono">{p.player_handle}</td>
                <td>
                  <span
                    className={`text-[10px] uppercase font-display tracking-widest px-2 py-1 rounded ${
                      p.status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/30'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-400/30'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="text-right font-mono text-neon-gold">{Number(p.chips).toLocaleString()}</td>
                <td className="text-right space-x-2">
                  <NeonButton size="sm" variant="ghost" onClick={() => adjustChips(p.id, p.chips)}>
                    Chips ±
                  </NeonButton>
                  <NeonButton size="sm" variant={p.status === 'banned' ? 'primary' : 'danger'} onClick={() => toggleBan(p)}>
                    {p.status === 'banned' ? 'Unban' : 'Ban'}
                  </NeonButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </NeonCard>

      {/* Tables */}
      <NeonCard glow="violet">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Tische</h2>
          <NeonButton size="sm" variant="gold" onClick={createTable}>+ Neuer Tisch</NeonButton>
        </div>
        {tables.length === 0 ? (
          <p className="text-white/40 text-sm">Noch keine Tische angelegt.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs uppercase tracking-widest">
                <th className="py-2">Name</th>
                <th>Blinds</th>
                <th>Buy-in</th>
                <th>Max</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id} className="border-t border-white/5">
                  <td className="py-2">{t.name}</td>
                  <td className="font-mono">{t.small_blind}/{t.big_blind}</td>
                  <td className="font-mono text-neon-gold">{Number(t.buy_in).toLocaleString()}</td>
                  <td className="font-mono">{t.max_players}</td>
                  <td>
                    <span className={`text-[10px] uppercase font-display tracking-widest px-2 py-1 rounded ${
                      t.archived_at
                        ? 'bg-white/5 text-white/50 border border-white/15'
                        : 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/30'
                    }`}>
                      {t.archived_at ? 'Archiviert' : 'Aktiv'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </NeonCard>
    </main>
  );
}
