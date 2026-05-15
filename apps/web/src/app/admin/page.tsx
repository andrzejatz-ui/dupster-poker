'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { adminCall, clearAdminToken, getAdminToken } from '@/lib/admin';
import { setSession } from '@/lib/session';
import { useT } from '@/i18n/context';

interface PlayerRow {
  id: string;
  player_handle: string;
  display_name: string | null;
  password: string | null;
  status: 'pending' | 'approved' | 'banned';
  chips: string;
  created_at: string;
}

interface TableRow {
  id: string;
  name: string;
  small_blind: string | number;
  big_blind: string | number;
  buy_in: string | number;
  max_players: number;
  archived_at: string | null;
}

export default function AdminDashboard() {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState<PlayerRow[]>([]);
  const [approved, setApproved] = useState<PlayerRow[]>([]);
  const [banned, setBanned] = useState<PlayerRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);

  useEffect(() => {
    if (!getAdminToken()) router.replace('/admin/login');
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function refresh() {
    try {
      const a = await adminCall('/players?status=pending');
      const b = await adminCall('/players?status=approved');
      const c = await adminCall('/players?status=banned');
      const ts = await adminCall('/tables');
      if (a.status === 401) { clearAdminToken(); router.replace('/admin/login'); return; }
      setPending(a.body.players ?? []);
      setApproved(b.body.players ?? []);
      setBanned(c.body.players ?? []);
      setTables(ts.body.tables ?? []);
    } catch (err) {
      console.error(err);
    }
  }

  async function approve(id: string) {
    const initialChips = Number(prompt(t('admin.prompt.initialChips'), '5000') ?? '0');
    await adminCall(`/players/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ initialChips: isFinite(initialChips) ? initialChips : 0 }),
    });
    refresh();
  }

  async function reject(id: string) {
    if (!confirm(t('admin.prompt.confirmReject'))) return;
    await adminCall(`/players/${id}/reject`, { method: 'POST' });
    refresh();
  }

  async function adjustChips(id: string, currentChips: string) {
    const delta = Number(prompt(t('admin.prompt.chipsAdjust', { chips: currentChips }), '1000') ?? '');
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

  async function setPlayerPassword(p: PlayerRow) {
    const newPw = prompt(t('admin.prompt.passwordSet'), p.password ?? '') ?? '';
    if (newPw.length < 4) return;
    const r = await adminCall(`/players/${p.id}/password`, {
      method: 'POST',
      body: JSON.stringify({ password: newPw }),
    });
    if (r.status !== 200) alert(r.body.error ?? 'failed');
    refresh();
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // older browsers / non-secure contexts: fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  async function toggleBan(p: PlayerRow) {
    if (p.status === 'banned') {
      await adminCall(`/players/${p.id}/unban`, { method: 'POST' });
    } else {
      const reason = prompt(t('admin.prompt.banReason'), '') ?? null;
      await adminCall(`/players/${p.id}/ban`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    }
    refresh();
  }

  async function createTable() {
    const name = prompt(t('admin.prompt.tableName'), 'Neon Table') ?? '';
    if (!name) return;
    const sb = Number(prompt(t('admin.prompt.tableSb'), '10') ?? '');
    const bb = Number(prompt(t('admin.prompt.tableBb'), '20') ?? '');
    const buyIn = Number(prompt(t('admin.prompt.tableBuyIn'), '1000') ?? '');
    const maxPlayers = Number(prompt(t('admin.prompt.tableMax'), '6') ?? '');
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
    if (r.status !== 200) alert(`${r.body.error}`);
    refresh();
  }

  function logout() {
    clearAdminToken();
    router.replace('/admin/login');
  }

  /**
   * Issues a player session for the admin so they can sit at a table
   * from the same browser. The admin's adminToken stays in
   * sessionStorage alongside the new player token, so going back to
   * /admin still works without re-login.
   */
  async function playAsAdmin() {
    const handle = (prompt(t('admin.prompt.playHandle'), 'admin') ?? '').trim();
    if (handle.length < 2) return;
    const chipsRaw = prompt(t('admin.prompt.playChips'), '10000');
    if (chipsRaw === null) return;
    const initialChips = Number(chipsRaw) || 0;
    const r = await adminCall('/play', {
      method: 'POST',
      body: JSON.stringify({
        playerHandle: handle,
        displayName: handle,
        initialChips,
      }),
    });
    if (r.status === 200 && r.body.token) {
      setSession(r.body.token, r.body.profile);
      router.push('/lobby');
      return;
    }
    alert(r.body.error ?? 'failed');
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between pr-24 sm:pr-36">
        <div>
          <h1 className="font-display text-3xl text-glow-violet text-neon-violet">
            {t('admin.title')}
          </h1>
          <p className="text-white/50 text-xs">
            {t('admin.counts', {
              pending: pending.length,
              approved: approved.length,
              banned: banned.length,
              tables: tables.length,
            })}
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3 flex-wrap justify-end">
          <NeonButton variant="gold" size="sm" onClick={playAsAdmin}>
            ▶ {t('admin.play')}
          </NeonButton>
          <Link href="/admin/audit"><NeonButton variant="ghost" size="sm">{t('admin.auditButton')}</NeonButton></Link>
          <NeonButton variant="ghost" size="sm" onClick={logout}>{t('admin.logout')}</NeonButton>
        </div>
      </header>

      {/* Pending */}
      <NeonCard glow="cyan">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-glow-cyan text-neon-cyan">{t('admin.pendingTitle')}</h2>
          <span className="text-xs text-white/40 font-mono">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-white/40 text-sm">{t('admin.pendingEmpty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs uppercase tracking-widest">
                <th className="py-2">{t('admin.col.handle')}</th>
                <th>{t('admin.col.display')}</th>
                <th>{t('admin.col.joined')}</th>
                <th className="text-right">{t('admin.col.actions')}</th>
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
                      {t('admin.approve')}
                    </NeonButton>
                    <NeonButton size="sm" variant="danger" onClick={() => reject(p.id)}>
                      {t('admin.reject')}
                    </NeonButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </NeonCard>

      {/* Approved + Banned */}
      <NeonCard glow="blue">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">{t('admin.players')}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-muted text-xs uppercase tracking-widest">
              <th className="py-2">{t('admin.col.handle')}</th>
              <th>{t('admin.col.status')}</th>
              <th>{t('admin.col.password')}</th>
              <th className="text-right">{t('admin.col.chips')}</th>
              <th className="text-right">{t('admin.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {[...approved, ...banned].map((p) => (
              <tr key={p.id} className="border-t border-rim-cool">
                <td className="py-2 font-mono">{p.player_handle}</td>
                <td>
                  <span
                    className={`text-[10px] uppercase font-display tracking-widest px-2 py-1 rounded ${
                      p.status === 'approved'
                        ? 'bg-status-success/10 text-status-success border border-status-success/30'
                        : 'bg-status-alert/10 text-status-alert border border-status-alert/30'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td>
                  {p.password ? (
                    <div className="inline-flex items-center gap-1.5">
                      <code className="px-2 py-0.5 rounded bg-obsidian-soft border border-rim-faint text-gold font-mono text-xs">
                        {p.password}
                      </code>
                      <button
                        type="button"
                        title={t('admin.passwordCopy')}
                        onClick={(e) => {
                          copyToClipboard(p.password!);
                          const btn = e.currentTarget;
                          const orig = btn.textContent;
                          btn.textContent = '✓';
                          setTimeout(() => { btn.textContent = orig; }, 1200);
                        }}
                        className="px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-ink-muted hover:text-gold"
                      >
                        ⧉
                      </button>
                    </div>
                  ) : (
                    <span className="text-ink-muted text-xs">{t('admin.passwordNone')}</span>
                  )}
                </td>
                <td className="text-right font-mono text-gold">{Number(p.chips).toLocaleString()}</td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  <NeonButton size="sm" variant="ghost" onClick={() => setPlayerPassword(p)}>
                    {p.password ? t('admin.passwordReset') : t('admin.passwordSet')}
                  </NeonButton>
                  <NeonButton size="sm" variant="ghost" onClick={() => adjustChips(p.id, p.chips)}>
                    {t('admin.chipsAdjust')}
                  </NeonButton>
                  <NeonButton size="sm" variant={p.status === 'banned' ? 'primary' : 'danger'} onClick={() => toggleBan(p)}>
                    {p.status === 'banned' ? t('admin.unban') : t('admin.ban')}
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
          <h2 className="font-display text-xl">{t('admin.tables')}</h2>
          <NeonButton size="sm" variant="gold" onClick={createTable}>{t('admin.newTable')}</NeonButton>
        </div>
        {tables.length === 0 ? (
          <p className="text-white/40 text-sm">{t('admin.tablesEmpty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs uppercase tracking-widest">
                <th className="py-2">{t('admin.col.name')}</th>
                <th>{t('admin.col.blinds')}</th>
                <th>{t('admin.col.buyIn')}</th>
                <th>{t('admin.col.max')}</th>
                <th>{t('admin.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((tbl) => (
                <tr key={tbl.id} className="border-t border-white/5">
                  <td className="py-2">{tbl.name}</td>
                  <td className="font-mono">{tbl.small_blind}/{tbl.big_blind}</td>
                  <td className="font-mono text-neon-gold">{Number(tbl.buy_in).toLocaleString()}</td>
                  <td className="font-mono">{tbl.max_players}</td>
                  <td>
                    <span className={`text-[10px] uppercase font-display tracking-widest px-2 py-1 rounded ${
                      tbl.archived_at
                        ? 'bg-white/5 text-white/50 border border-white/15'
                        : 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/30'
                    }`}>
                      {tbl.archived_at ? t('admin.tableStatus.archived') : t('admin.tableStatus.active')}
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
