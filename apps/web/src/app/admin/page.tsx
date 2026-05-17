'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Signature } from '@/components/ui/Signature';
import { Eye } from '@/components/brand/Eye';
import { adminCall, clearAdminToken, getAdminToken } from '@/lib/admin';
import { setSession, getToken } from '@/lib/session';
import { useT } from '@/i18n/context';
import clsx from 'clsx';

interface PlayerRow {
  id: string;
  player_handle: string;
  display_name: string | null;
  password: string | null;
  status: 'pending' | 'approved' | 'banned';
  chips: string;
  created_at: string;
  last_login_at: string | null;
  seat_table_id: string | null;
  seat_index: number | null;
  seat_stack: string | null;
}

interface AdminProfile {
  id: string;
  username: string;
  playHandle: string | null;
  playChips: number;
}

interface TableRow {
  id: string;
  name: string;
  small_blind: string | number;
  big_blind: string | number;
  buy_in: string | number;
  max_players: number;
  archived_at: string | null;
  is_paused: boolean;
  seated: number;
  in_hand: boolean;
  hand_number: number;
}

interface ChipRequestRow {
  id: string;
  amount: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  kind: 'topup' | 'cashout';
  created_at: string;
  player_id: string;
  player_handle: string;
  display_name: string | null;
  chips: string;
}

interface AdRow {
  id: string;
  kicker: string;
  headline: string;
  body: string;
  disclaimer: string | null;
  icon: string;
  tone: 'gold' | 'smoky' | 'alert';
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type Dialog =
  | null
  | { kind: 'settings' }
  | { kind: 'approve'; player: PlayerRow }
  | { kind: 'chips'; player: PlayerRow }
  | { kind: 'ban'; player: PlayerRow }
  | { kind: 'reject'; player: PlayerRow }
  | { kind: 'delete'; player: PlayerRow }
  | { kind: 'password'; player: PlayerRow }
  | { kind: 'createTable' }
  | { kind: 'editTable'; table: TableRow }
  | { kind: 'closeTable'; table: TableRow }
  | { kind: 'deleteTable'; table: TableRow }
  | { kind: 'editAd'; ad: AdRow | null };

export default function AdminDashboard() {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState<PlayerRow[]>([]);
  const [approved, setApproved] = useState<PlayerRow[]>([]);
  const [banned, setBanned] = useState<PlayerRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [chipRequests, setChipRequests] = useState<ChipRequestRow[]>([]);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [me, setMe] = useState<AdminProfile | null>(null);
  /** Is there an active player session in this tab? Lets us show a
   *  "Continue playing" button so the admin can hop back into the
   *  same player view they left without re-minting a session. */
  const [hasPlayerSession, setHasPlayerSession] = useState(false);
  useEffect(() => {
    setHasPlayerSession(getToken() !== null);
  }, []);

  useEffect(() => {
    if (!getAdminToken()) router.replace('/admin/login');
    refresh();
    // light auto-refresh so new pending requests + table state surface
    const i = setInterval(refresh, 4000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function refresh() {
    try {
      const [a, b, c, ts, meRes, crs, adsRes] = await Promise.all([
        adminCall('/players?status=pending'),
        adminCall('/players?status=approved'),
        adminCall('/players?status=banned'),
        adminCall('/tables'),
        adminCall('/me'),
        adminCall('/chip-requests'),
        adminCall('/ads'),
      ]);
      if (a.status === 401) { clearAdminToken(); router.replace('/admin/login'); return; }
      setPending(a.body.players ?? []);
      setApproved(b.body.players ?? []);
      setBanned(c.body.players ?? []);
      setTables(ts.body.tables ?? []);
      setChipRequests(crs.body.requests ?? []);
      setAds(adsRes.body.ads ?? []);
      if (meRes.status === 200) setMe(meRes.body);
    } catch {/* ignore */}
  }

  async function saveAd(ad: Partial<AdRow> & { id?: string }) {
    const body: Record<string, unknown> = {
      kicker: ad.kicker,
      headline: ad.headline,
      body: ad.body,
      disclaimer: ad.disclaimer ?? null,
      icon: ad.icon,
      tone: ad.tone,
      sortOrder: ad.sort_order,
      isActive: ad.is_active,
    };
    const r = ad.id
      ? await adminCall(`/ads/${ad.id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await adminCall('/ads', { method: 'POST', body: JSON.stringify(body) });
    if (r.status !== 200) { alert(r.body.error ?? 'failed'); return; }
    setDialog(null);
    refresh();
  }
  async function toggleAdActive(ad: AdRow) {
    const r = await adminCall(`/ads/${ad.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: !ad.is_active }),
    });
    if (r.status !== 200) { alert(r.body.error ?? 'failed'); return; }
    refresh();
  }
  async function deleteAd(ad: AdRow) {
    if (!confirm(`Delete ad "${ad.headline}"?`)) return;
    const r = await adminCall(`/ads/${ad.id}`, { method: 'DELETE' });
    if (r.status !== 200) { alert(r.body.error ?? 'failed'); return; }
    refresh();
  }

  async function approveChipRequest(req: ChipRequestRow, amount: number) {
    const r = await adminCall(`/chip-requests/${req.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    if (r.status !== 200) {
      alert(r.body.error ?? 'failed');
      return;
    }
    refresh();
  }
  async function rejectChipRequest(req: ChipRequestRow) {
    const r = await adminCall(`/chip-requests/${req.id}/reject`, { method: 'POST' });
    if (r.status !== 200) {
      alert(r.body.error ?? 'failed');
      return;
    }
    refresh();
  }

  function logout() {
    clearAdminToken();
    router.replace('/admin/login');
  }

  /**
   * Play shortcut. If the admin has stored a play_handle in /admin/me,
   * call /admin/play with no body — the server falls back to the stored
   * defaults and we route straight to the lobby. Otherwise pop the
   * Settings dialog so they can set one.
   */
  async function startPlaying() {
    if (!me?.playHandle) {
      setDialog({ kind: 'settings' });
      return;
    }
    const r = await adminCall('/play', { method: 'POST', body: JSON.stringify({}) });
    if (r.status === 200 && r.body.token) {
      setSession(r.body.token, r.body.profile);
      router.push('/lobby');
    } else if (r.body.error === 'no_handle_configured') {
      setDialog({ kind: 'settings' });
    } else {
      alert(r.body.error ?? 'failed');
    }
  }

  /**
   * Spin up a private bot table and drop the admin into it. Reuses the
   * admin's play-handle (prompting via Settings if it's still empty),
   * tops up chips for the buy-in, and navigates straight to the table.
   * Bot opponents are server-driven; the admin can fold, raise, sit out,
   * etc. exactly as they would against humans.
   */
  async function startTestRoom() {
    if (!me?.playHandle) {
      setDialog({ kind: 'settings' });
      return;
    }
    const r = await adminCall('/test-room', { method: 'POST', body: JSON.stringify({}) });
    if (r.status === 200 && r.body.token) {
      setSession(r.body.token, r.body.profile);
      router.push(`/table/${r.body.tableId}`);
    } else if (r.body.error === 'no_handle_configured') {
      setDialog({ kind: 'settings' });
    } else {
      alert(r.body.error ?? 'failed');
    }
  }

  async function pauseToggle(table: TableRow) {
    await adminCall(`/tables/${table.id}/${table.is_paused ? 'resume' : 'pause'}`, { method: 'POST' });
    refresh();
  }

  return (
    <>
      <main className="min-h-screen px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto space-y-6">
        {/* Header stacks vertically on phone (title + stats up top,
            actions in a wrapping row below) so the Telegram WebView
            doesn't crush the title under the button column. Side-by-
            side starting at sm: where there's room. */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pr-24 sm:pr-36">
          <div className="flex items-center gap-3 min-w-0">
            <div className="opacity-80 shrink-0">
              <Eye size={32} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-3xl text-gold text-glow-gold leading-tight">
                {t('admin.title')}
              </h1>
              <p className="text-ink-muted text-[11px] sm:text-xs leading-snug">
                {t('admin.counts', {
                  pending: pending.length,
                  approved: approved.length,
                  banned: banned.length,
                  tables: tables.filter(x => !x.archived_at).length,
                })}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 flex-wrap sm:justify-end">
            {hasPlayerSession && (
              <NeonButton
                variant="gold"
                size="sm"
                onClick={() => router.push('/lobby')}
              >
                ↩ {t('admin.continuePlaying')}
              </NeonButton>
            )}
            <NeonButton variant="gold" size="sm" onClick={startPlaying}>
              ▶ {me?.playHandle ? `${t('admin.play')} · ${me.playHandle}` : t('admin.play')}
            </NeonButton>
            <NeonButton variant="ghost" size="sm" onClick={startTestRoom}>
              ▶ {t('admin.testRoom')}
            </NeonButton>
            <NeonButton variant="ghost" size="sm" onClick={() => setDialog({ kind: 'settings' })}>
              ⚙ {t('admin.settings')}
            </NeonButton>
            <Link href="/admin/audit">
              <NeonButton variant="ghost" size="sm">{t('admin.auditButton')}</NeonButton>
            </Link>
            <NeonButton variant="ghost" size="sm" onClick={logout}>{t('admin.logout')}</NeonButton>
          </div>
        </header>

        {/* Chip requests — auto-refreshes every 4 s, gold-glowing if any
            pending so the admin can't miss a new one. */}
        {chipRequests.length > 0 && (
          <NeonCard glow="gold" className="border-gold/40 bg-gold/[0.06]">
            <SectionTitle
              title={t('admin.chipRequests.title')}
              count={chipRequests.length}
            />
            <div className="space-y-2">
              {chipRequests.map((req) => (
                <ChipRequestRowCmp
                  key={req.id}
                  req={req}
                  onApprove={(amount) => approveChipRequest(req, amount)}
                  onReject={() => rejectChipRequest(req)}
                />
              ))}
            </div>
          </NeonCard>
        )}

        {/* Pending */}
        <NeonCard glow="gold">
          <SectionTitle title={t('admin.pendingTitle')} count={pending.length} />
          {pending.length === 0 ? (
            <p className="text-ink-muted text-sm">{t('admin.pendingEmpty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted text-xs uppercase tracking-widest">
                  <th className="py-2">{t('admin.col.handle')}</th>
                  <th>{t('admin.col.display')}</th>
                  <th>{t('admin.col.joined')}</th>
                  <th className="text-right">{t('admin.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-t border-rim-cool">
                    <td className="py-2 font-mono">{p.player_handle}</td>
                    <td className="text-ink-secondary">{p.display_name ?? '—'}</td>
                    <td className="text-ink-muted font-mono">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="text-right space-x-2">
                      <NeonButton size="sm" variant="primary" onClick={() => setDialog({ kind: 'approve', player: p })}>
                        {t('admin.approve')}
                      </NeonButton>
                      <NeonButton size="sm" variant="danger" onClick={() => setDialog({ kind: 'reject', player: p })}>
                        {t('admin.reject')}
                      </NeonButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </NeonCard>

        {/* Approved + Banned — desktop table, mobile card list.
            Wide horizontal table on Mobile (Telegram-WebView) was
            hiding the "delete / adjust chips / ban" buttons behind a
            scrollbar nobody noticed. On mobile every row becomes a
            stacked card with all actions visible. */}
        <NeonCard glow="gold">
          <SectionTitle title={t('admin.players')} count={approved.length + banned.length} />

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-ink-muted text-xs uppercase tracking-widest">
                  <th className="py-2">{t('admin.col.handle')}</th>
                  <th>{t('admin.col.status')}</th>
                  <th>{t('admin.col.password')}</th>
                  <th>{t('admin.col.lastLogin')}</th>
                  <th className="text-right">{t('admin.col.chips')}</th>
                  <th className="text-right">{t('admin.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {[...approved, ...banned].map((p) => (
                  <tr key={p.id} className="border-t border-rim-cool align-middle">
                    <td className="py-2">
                      <div className="font-mono">{p.player_handle}</div>
                      {p.seat_table_id && (
                        <div className="text-[10px] uppercase tracking-widest text-gold/70 mt-0.5">
                          {t('admin.seatedAt')} · {t('admin.col.chips')}: {Number(p.seat_stack ?? 0).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td>
                      <PasswordCell value={p.password} />
                    </td>
                    <td className="font-mono text-[11px] text-ink-muted whitespace-nowrap">
                      {p.last_login_at ? new Date(p.last_login_at).toLocaleString() : '—'}
                    </td>
                    <td className="text-right font-mono text-gold">
                      {Number(p.chips).toLocaleString()}
                    </td>
                    <td className="text-right space-x-2 whitespace-nowrap">
                      <PlayerActions
                        player={p}
                        onAction={(kind) => setDialog({ kind, player: p })}
                        onUnban={async () => {
                          await adminCall(`/players/${p.id}/unban`, { method: 'POST' });
                          refresh();
                        }}
                        onKick={async () => {
                          await adminCall(`/players/${p.id}/kick`, { method: 'POST' });
                          refresh();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list — every action visible, no horizontal scroll */}
          <div className="md:hidden space-y-3">
            {[...approved, ...banned].map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-rim-cool bg-obsidian-soft/40 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-sm truncate">{p.player_handle}</div>
                    {p.display_name && (
                      <div className="text-[11px] text-ink-secondary truncate">{p.display_name}</div>
                    )}
                  </div>
                  <StatusPill status={p.status} />
                </div>
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-ink-muted uppercase tracking-widest">{t('admin.col.chips')}</span>
                  <span className="font-mono text-gold">{Number(p.chips).toLocaleString()}</span>
                </div>
                {p.seat_table_id && (
                  <div className="text-[10px] uppercase tracking-widest text-gold/70">
                    {t('admin.seatedAt')} · {Number(p.seat_stack ?? 0).toLocaleString()}
                  </div>
                )}
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-ink-muted uppercase tracking-widest">{t('admin.col.password')}</span>
                  <PasswordCell value={p.password} />
                </div>
                <div className="text-[10px] text-ink-muted font-mono">
                  {p.last_login_at ? new Date(p.last_login_at).toLocaleString() : '—'}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-rim-faint">
                  <PlayerActions
                    player={p}
                    onAction={(kind) => setDialog({ kind, player: p })}
                    onUnban={async () => {
                      await adminCall(`/players/${p.id}/unban`, { method: 'POST' });
                      refresh();
                    }}
                    onKick={async () => {
                      await adminCall(`/players/${p.id}/kick`, { method: 'POST' });
                      refresh();
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </NeonCard>

        {/* Tables */}
        <NeonCard glow="gold">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl">{t('admin.tables')}</h2>
            <NeonButton size="sm" variant="gold" onClick={() => setDialog({ kind: 'createTable' })}>
              {t('admin.newTable')}
            </NeonButton>
          </div>
          {tables.length === 0 ? (
            <p className="text-ink-muted text-sm">{t('admin.tablesEmpty')}</p>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-ink-muted text-xs uppercase tracking-widest">
                    <th className="py-2">{t('admin.col.name')}</th>
                    <th>{t('admin.col.blinds')}</th>
                    <th>{t('admin.col.buyIn')}</th>
                    <th>{t('lobby.playersCount')}</th>
                    <th>{t('admin.col.status')}</th>
                    <th className="text-right">{t('admin.col.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((tbl) => (
                    <tr key={tbl.id} className="border-t border-rim-cool">
                      <td className="py-2">
                        <div>{tbl.name}</div>
                        {tbl.in_hand && (
                          <div className="text-[10px] uppercase tracking-widest text-gold/70 mt-0.5">
                            {t('table.handNumber')}{tbl.hand_number}
                          </div>
                        )}
                      </td>
                      <td className="font-mono">{tbl.small_blind}/{tbl.big_blind}</td>
                      <td className="font-mono text-gold">{Number(tbl.buy_in).toLocaleString()}</td>
                      <td className="font-mono">{tbl.seated}/{tbl.max_players}</td>
                      <td>
                        <TableStatusPill table={tbl} />
                      </td>
                      <td className="text-right space-x-2 whitespace-nowrap">
                        {!tbl.archived_at && (
                          <>
                            <NeonButton size="sm" variant="ghost" onClick={() => setDialog({ kind: 'editTable', table: tbl })}>
                              {t('admin.tableEdit')}
                            </NeonButton>
                            <NeonButton size="sm" variant="ghost" onClick={() => pauseToggle(tbl)}>
                              {tbl.is_paused ? t('admin.tableResume') : t('admin.tablePause')}
                            </NeonButton>
                            <NeonButton size="sm" variant="danger" onClick={() => setDialog({ kind: 'closeTable', table: tbl })}>
                              {t('admin.tableClose')}
                            </NeonButton>
                          </>
                        )}
                        <NeonButton size="sm" variant="danger" onClick={() => setDialog({ kind: 'deleteTable', table: tbl })}>
                          {t('admin.tableDelete')}
                        </NeonButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NeonCard>

        {/* Ads — admin-managed fake-ad inventory shown in the lobby
            carousel. Active rows rotate in sort_order; inactive rows
            stay in the dashboard so a copy can be revived later. */}
        <NeonCard glow="gold">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="font-display text-xl">{t('admin.ads.title')}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-ink-muted font-display">
                {ads.filter((a) => a.is_active).length}/{ads.length} {t('admin.ads.activeShort')}
              </span>
              <NeonButton size="sm" variant="gold" onClick={() => setDialog({ kind: 'editAd', ad: null })}>
                + {t('admin.ads.new')}
              </NeonButton>
            </div>
          </div>
          {ads.length === 0 ? (
            <p className="text-ink-muted text-sm">{t('admin.ads.empty')}</p>
          ) : (
            <div className="space-y-2">
              {ads.map((ad) => (
                <AdRowCmp
                  key={ad.id}
                  ad={ad}
                  onEdit={() => setDialog({ kind: 'editAd', ad })}
                  onToggle={() => toggleAdActive(ad)}
                  onDelete={() => deleteAd(ad)}
                />
              ))}
            </div>
          )}
        </NeonCard>

        <Signature className="mt-8 pb-6" />
      </main>

      {/* ---- Dialogs ---- */}
      {dialog?.kind === 'settings' && (
        <SettingsDialog
          initial={me}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refresh(); }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={t('admin.prompt.confirmDelete', { handle: dialog.player.player_handle })}
          subtitle={t('admin.prompt.confirmDeleteBody')}
          confirmLabel={t('admin.delete')}
          variant="danger"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await adminCall(`/players/${dialog.player.id}`, { method: 'DELETE' });
            setDialog(null); refresh();
          }}
        />
      )}
      {dialog?.kind === 'approve' && (
        <ApproveDialog
          player={dialog.player}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refresh(); }}
        />
      )}
      {dialog?.kind === 'reject' && (
        <ConfirmDialog
          title={t('admin.prompt.confirmReject')}
          confirmLabel={t('admin.reject')}
          variant="danger"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await adminCall(`/players/${dialog.player.id}/reject`, { method: 'POST' });
            setDialog(null); refresh();
          }}
        />
      )}
      {dialog?.kind === 'chips' && (
        <ChipsDialog
          player={dialog.player}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refresh(); }}
        />
      )}
      {dialog?.kind === 'ban' && (
        <BanDialog
          player={dialog.player}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refresh(); }}
        />
      )}
      {dialog?.kind === 'password' && (
        <PasswordDialog
          player={dialog.player}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refresh(); }}
        />
      )}
      {dialog?.kind === 'createTable' && (
        <CreateTableDialog
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refresh(); }}
        />
      )}
      {dialog?.kind === 'editTable' && (
        <EditTableDialog
          table={dialog.table}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refresh(); }}
        />
      )}
      {dialog?.kind === 'closeTable' && (
        <ConfirmDialog
          title={t('admin.prompt.confirmCloseTable', { name: dialog.table.name })}
          subtitle={t('admin.prompt.confirmCloseTableBody')}
          confirmLabel={t('admin.tableClose')}
          variant="danger"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await adminCall(`/tables/${dialog.table.id}/close`, { method: 'POST' });
            setDialog(null); refresh();
          }}
        />
      )}
      {dialog?.kind === 'deleteTable' && (
        <ConfirmDialog
          title={t('admin.prompt.confirmDeleteTable', { name: dialog.table.name })}
          subtitle={t('admin.prompt.confirmDeleteTableBody')}
          confirmLabel={t('admin.tableDelete')}
          variant="danger"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const r = await adminCall(`/tables/${dialog.table.id}`, { method: 'DELETE' });
            if (r.status !== 200) {
              alert(r.body.error ?? 'failed');
              return;
            }
            setDialog(null); refresh();
          }}
        />
      )}
      {dialog?.kind === 'editAd' && (
        <AdEditDialog
          ad={dialog.ad}
          onClose={() => setDialog(null)}
          onSave={saveAd}
        />
      )}
    </>
  );
}

/* ---------- presentational helpers ---------- */

/**
 * Inline row for a pending chip-grant request. Admin picks an amount
 * (pre-filled with what the player asked for, free to override) and
 * clicks Approve to move chips into the player's wallet — or Reject
 * to dismiss the request without granting anything.
 */
function ChipRequestRowCmp({
  req,
  onApprove,
  onReject,
}: {
  req: ChipRequestRow;
  onApprove: (amount: number) => void;
  onReject: () => void;
}) {
  const t = useT();
  const asked = req.amount ? Number(req.amount) : 0;
  const [amount, setAmount] = useState<number>(asked > 0 ? asked : 1000);
  const isCashout = req.kind === 'cashout';
  // Visual distinction between the two flows — gold border for chip
  // top-up requests, soft red for cashout requests so the admin
  // glances and instantly knows which direction chips will flow.
  const cardTone = isCashout
    ? 'border-status-alert/45 bg-status-alert/[0.06]'
    : 'border-gold/40 bg-obsidian-soft/60';
  const kindLabel = isCashout
    ? t('admin.chipRequests.cashoutLabel')
    : t('admin.chipRequests.topupLabel');
  const kindColor = isCashout
    ? 'text-status-alert/85 border-status-alert/40 bg-status-alert/10'
    : 'text-gold border-gold/40 bg-gold/10';
  const askedText = isCashout
    ? (asked > 0
        ? t('admin.chipRequests.wantsCashout', { amount: asked.toLocaleString() })
        : t('admin.chipRequests.wantsCashoutNoAmount'))
    : (asked > 0
        ? t('admin.chipRequests.asked', { amount: asked.toLocaleString() })
        : t('admin.chipRequests.askedNoAmount'));
  return (
    <div className={clsx('rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3', cardTone)}>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={clsx(
            'inline-block text-[9px] uppercase tracking-[0.22em] font-display px-1.5 py-0.5 rounded border',
            kindColor,
          )}>
            {isCashout ? '📤' : '💰'} {kindLabel}
          </span>
          <span className="font-display text-gold text-sm sm:text-base truncate">
            {req.display_name ?? req.player_handle}
          </span>
          <span className="font-mono text-[11px] text-ink-muted">
            @{req.player_handle}
          </span>
          {/* Cashout already deducted the amount from the wallet at
              request time — show the post-hold balance + the held
              amount separately so the admin doesn't expect the wallet
              to drop again on approval. */}
          {isCashout ? (
            <span className="font-mono text-[10px] text-ink-muted">
              · {t('admin.chipRequests.wallet')}: {Number(req.chips).toLocaleString()}
              {' '}({t('admin.chipRequests.heldNote', { amount: asked.toLocaleString() })})
            </span>
          ) : (
            <span className="font-mono text-[10px] text-ink-muted">
              · {t('admin.chipRequests.wallet')}: {Number(req.chips).toLocaleString()}
            </span>
          )}
        </div>
        <div className="text-xs text-ink-secondary mt-1">
          {askedText}
          {req.message && (
            <>
              {' — '}
              <span className="italic">{req.message}</span>
            </>
          )}
        </div>
        {isCashout && (
          <div className="text-[10px] text-status-alert/80 italic mt-1 leading-tight">
            {t('admin.chipRequests.cashoutHint')}
          </div>
        )}
        <div className="text-[10px] text-ink-muted font-mono mt-1">
          {new Date(req.created_at).toLocaleString()}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => {
            // Cashout approval is hard-capped at the held amount (asked) —
            // admins can grant less and refund the rest, never more.
            const raw = Math.max(1, Math.floor(Number(e.target.value) || 0));
            setAmount(isCashout && asked > 0 ? Math.min(raw, asked) : raw);
          }}
          max={isCashout && asked > 0 ? asked : undefined}
          className="w-28 px-2 py-1 rounded-md bg-obsidian-bg border border-rim-bright font-mono text-sm text-gold text-right"
        />
        <NeonButton size="sm" variant="gold" onClick={() => onApprove(amount)}>
          {isCashout ? t('admin.chipRequests.approveCashout') : t('admin.chipRequests.approve')}
        </NeonButton>
        <NeonButton size="sm" variant="danger" onClick={onReject}>
          {t('admin.chipRequests.reject')}
        </NeonButton>
      </div>
    </div>
  );
}

/**
 * Action-button cluster reused by the desktop table row and the mobile
 * card list — single source of truth so the buttons (and their wiring)
 * stay identical in both layouts. Renders Password / Adjust Chips /
 * Kick (only when seated) / Ban or Unban / Delete.
 */
function PlayerActions({
  player,
  onAction,
  onUnban,
  onKick,
}: {
  player: PlayerRow;
  onAction: (kind: 'password' | 'chips' | 'ban' | 'delete') => void;
  onUnban: () => void;
  onKick: () => void;
}) {
  const t = useT();
  return (
    <>
      <NeonButton size="sm" variant="ghost" onClick={() => onAction('password')}>
        {player.password ? t('admin.passwordReset') : t('admin.passwordSet')}
      </NeonButton>
      <NeonButton size="sm" variant="ghost" onClick={() => onAction('chips')}>
        {t('admin.chipsAdjust')}
      </NeonButton>
      {player.seat_table_id && (
        <NeonButton size="sm" variant="danger" onClick={onKick}>
          {t('admin.kick')}
        </NeonButton>
      )}
      <NeonButton
        size="sm"
        variant={player.status === 'banned' ? 'primary' : 'danger'}
        onClick={() => {
          if (player.status === 'banned') onUnban();
          else onAction('ban');
        }}
      >
        {player.status === 'banned' ? t('admin.unban') : t('admin.ban')}
      </NeonButton>
      <NeonButton size="sm" variant="danger" onClick={() => onAction('delete')}>
        {t('admin.delete')}
      </NeonButton>
    </>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-display text-xl text-gold text-glow-gold">{title}</h2>
      <span className="text-xs text-ink-muted font-mono">{count}</span>
    </div>
  );
}

function StatusPill({ status }: { status: 'pending' | 'approved' | 'banned' }) {
  const styles: Record<typeof status, string> = {
    pending: 'bg-gold/10 text-gold border-gold/30',
    approved: 'bg-status-success/10 text-status-success border-status-success/30',
    banned: 'bg-status-alert/10 text-status-alert border-status-alert/30',
  };
  return (
    <span className={`text-[10px] uppercase font-display tracking-widest px-2 py-1 rounded border ${styles[status]}`}>
      {status}
    </span>
  );
}

function TableStatusPill({ table }: { table: TableRow }) {
  const t = useT();
  if (table.archived_at) {
    return <Pill tone="muted">{t('admin.tableStatus.archived')}</Pill>;
  }
  if (table.is_paused) return <Pill tone="warning">{t('admin.tableStatus.paused')}</Pill>;
  if (table.in_hand)   return <Pill tone="alert">{t('lobby.inHand')}</Pill>;
  return <Pill tone="success">{t('admin.tableStatus.active')}</Pill>;
}

function Pill({ tone, children }: { tone: 'success' | 'alert' | 'warning' | 'muted'; children: ReactNode }) {
  const map = {
    success: 'bg-status-success/10 text-status-success border-status-success/30',
    alert: 'bg-status-alert/10 text-status-alert border-status-alert/30',
    warning: 'bg-status-warning/10 text-status-warning border-status-warning/30',
    muted: 'bg-obsidian-soft text-ink-muted border-rim-faint',
  };
  return (
    <span className={`text-[10px] uppercase font-display tracking-widest px-2 py-1 rounded border ${map[tone]}`}>
      {children}
    </span>
  );
}

function PasswordCell({ value }: { value: string | null }) {
  const t = useT();
  if (!value) return <span className="text-ink-muted text-xs">{t('admin.passwordNone')}</span>;
  return (
    <div className="inline-flex items-center gap-1.5">
      <code className="px-2 py-0.5 rounded bg-obsidian-soft border border-rim-faint text-gold font-mono text-xs">
        {value}
      </code>
      <button
        type="button"
        title={t('admin.passwordCopy')}
        onClick={async (e) => {
          const btn = e.currentTarget;
          try { await navigator.clipboard.writeText(value); } catch {}
          const orig = btn.textContent; btn.textContent = '✓';
          setTimeout(() => { btn.textContent = orig; }, 1200);
        }}
        className="px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-ink-muted hover:text-gold"
      >
        ⧉
      </button>
    </div>
  );
}

/* ---------- Dialog implementations ---------- */

function DialogFooter({ onCancel, onSubmit, busy, submitLabel, variant = 'gold' }: {
  onCancel: () => void;
  onSubmit?: () => void;
  busy?: boolean;
  submitLabel: string;
  variant?: 'gold' | 'primary' | 'danger';
}) {
  const t = useT();
  return (
    <>
      <NeonButton variant="ghost" onClick={onCancel}>{t('common.cancel')}</NeonButton>
      {onSubmit && (
        <NeonButton variant={variant} onClick={onSubmit} disabled={busy}>{submitLabel}</NeonButton>
      )}
    </>
  );
}

function SettingsDialog({ initial, onClose, onSaved }: {
  initial: AdminProfile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [handle, setHandle] = useState(initial?.playHandle ?? 'admin');
  const [chips, setChips] = useState(initial?.playChips ?? 10000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null); setBusy(true);
    const r = await adminCall('/me', {
      method: 'POST',
      body: JSON.stringify({ playHandle: handle.trim(), playChips: chips }),
    });
    setBusy(false);
    if (r.status === 200) onSaved();
    else setError(r.body.error ?? 'failed');
  }
  return (
    <Modal open onClose={onClose}
           title={t('admin.settings')}
           subtitle={t('admin.settingsBody')}
           footer={<DialogFooter onCancel={onClose} onSubmit={submit} busy={busy} submitLabel={t('common.confirm')} />}>
      <NeonInput id="set-handle" label={t('admin.settingsHandle')} value={handle}
                 onChange={(e) => setHandle(e.target.value)} autoFocus error={error}
                 hint={t('admin.settingsHandleHint')} />
      <NeonInput id="set-chips" label={t('admin.settingsChips')} type="number" inputMode="numeric"
                 value={String(chips)} onChange={(e) => setChips(Number(e.target.value) || 0)}
                 hint={t('admin.settingsChipsHint')} />
    </Modal>
  );
}

function ApproveDialog({ player, onClose, onDone }: {
  player: PlayerRow; onClose: () => void; onDone: () => void;
}) {
  const t = useT();
  const [chips, setChips] = useState(5000);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    await adminCall(`/players/${player.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ initialChips: chips }),
    });
    setBusy(false); onDone();
  }
  return (
    <Modal open onClose={onClose} title={`${t('admin.approve')} · ${player.player_handle}`}
           footer={<DialogFooter onCancel={onClose} onSubmit={submit} busy={busy} submitLabel={t('admin.approve')} />}>
      <NeonInput id="approve-chips" label={t('admin.prompt.initialChips')} type="number" inputMode="numeric"
                 value={String(chips)} onChange={(e) => setChips(Math.max(0, Number(e.target.value) || 0))}
                 autoFocus />
    </Modal>
  );
}

function ChipsDialog({ player, onClose, onDone }: {
  player: PlayerRow; onClose: () => void; onDone: () => void;
}) {
  const t = useT();
  const seated = player.seat_table_id !== null;
  const [delta, setDelta] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null); setBusy(true);
    const r = await adminCall(`/players/${player.id}/chips`, {
      method: 'POST',
      body: JSON.stringify({
        delta,
        reason: delta >= 0 ? 'admin_grant' : 'admin_revoke',
        note: seated ? 'mid-game top-up' : 'balance adjust',
      }),
    });
    setBusy(false);
    if (r.status === 200) onDone();
    else setError(r.body.error ?? 'failed');
  }
  return (
    <Modal open onClose={onClose}
           title={`${t('admin.chipsAdjust')} · ${player.player_handle}`}
           subtitle={seated
             ? t('admin.prompt.chipsAdjustSeated', { stack: Number(player.seat_stack ?? 0).toLocaleString() })
             : t('admin.prompt.chipsAdjustBalance', { chips: Number(player.chips).toLocaleString() })}
           footer={<DialogFooter onCancel={onClose} onSubmit={submit} busy={busy}
                                 submitLabel={delta >= 0 ? `+ ${delta.toLocaleString()}` : `− ${Math.abs(delta).toLocaleString()}`} />}>
      <div className="flex gap-2 mb-2">
        {[100, 500, 1000, 5000].map(v => (
          <button key={v} type="button" onClick={() => setDelta(v)}
                  className="flex-1 px-2 py-1.5 rounded-md border border-rim-bright text-gold text-xs font-mono hover:bg-gold/10">
            +{v.toLocaleString()}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {[-100, -500, -1000, -5000].map(v => (
          <button key={v} type="button" onClick={() => setDelta(v)}
                  className="flex-1 px-2 py-1.5 rounded-md border border-status-alert/30 text-status-alert text-xs font-mono hover:bg-status-alert/10">
            {v.toLocaleString()}
          </button>
        ))}
      </div>
      <NeonInput id="chips-delta" label={t('admin.prompt.customAmount')} type="number" inputMode="numeric"
                 value={String(delta)} onChange={(e) => setDelta(Math.trunc(Number(e.target.value) || 0))}
                 error={error} />
    </Modal>
  );
}

function BanDialog({ player, onClose, onDone }: {
  player: PlayerRow; onClose: () => void; onDone: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    await adminCall(`/players/${player.id}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() || null }),
    });
    setBusy(false); onDone();
  }
  return (
    <Modal open onClose={onClose}
           title={`${t('admin.ban')} · ${player.player_handle}`}
           footer={<DialogFooter onCancel={onClose} onSubmit={submit} busy={busy}
                                 submitLabel={t('admin.ban')} variant="danger" />}>
      <NeonInput id="ban-reason" label={t('admin.prompt.banReason')} value={reason}
                 onChange={(e) => setReason(e.target.value)} autoFocus
                 hint={t('admin.prompt.banReasonHint')} />
    </Modal>
  );
}

function PasswordDialog({ player, onClose, onDone }: {
  player: PlayerRow; onClose: () => void; onDone: () => void;
}) {
  const t = useT();
  const [pw, setPw] = useState(player.password ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (pw.length < 4) { setError(t('join.errors.invalidPassword')); return; }
    setError(null); setBusy(true);
    const r = await adminCall(`/players/${player.id}/password`, {
      method: 'POST', body: JSON.stringify({ password: pw }),
    });
    setBusy(false);
    if (r.status === 200) onDone();
    else setError(r.body.error ?? 'failed');
  }
  return (
    <Modal open onClose={onClose}
           title={`${player.password ? t('admin.passwordReset') : t('admin.passwordSet')} · ${player.player_handle}`}
           subtitle={t('admin.prompt.passwordSet')}
           footer={<DialogFooter onCancel={onClose} onSubmit={submit} busy={busy}
                                 submitLabel={t('common.confirm')} />}>
      <NeonInput id="pw-new" label={t('join.passwordLabel')} value={pw}
                 onChange={(e) => setPw(e.target.value)} autoFocus error={error} />
    </Modal>
  );
}

// Mirrors the server's ensureDefaultTables tiers. Stakes escalate ×5
// per step; buy-in stays at 50 BB everywhere.
const TABLE_PRESETS = [
  { key: 'breeze',    name: 'Breeze',    sb: 5,    bb: 10,   buyIn: 500,    maxPlayers: 6 },
  { key: 'storm',     name: 'Storm',     sb: 25,   bb: 50,   buyIn: 2500,   maxPlayers: 6 },
  { key: 'tornado',   name: 'Tornado',   sb: 100,  bb: 200,  buyIn: 10000,  maxPlayers: 6 },
  { key: 'hurricane', name: 'Hurricane', sb: 500,  bb: 1000, buyIn: 50000,  maxPlayers: 6 },
  { key: 'tsunami',   name: 'Tsunami',   sb: 2500, bb: 5000, buyIn: 250000, maxPlayers: 6 },
] as const;

function CreateTableDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState('Breeze');
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [buyIn, setBuyIn] = useState(500);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>('breeze');

  function applyPreset(p: typeof TABLE_PRESETS[number]) {
    setActivePreset(p.key);
    setName(p.name);
    setSb(p.sb);
    setBb(p.bb);
    setBuyIn(p.buyIn);
    setMaxPlayers(p.maxPlayers);
  }

  async function submit() {
    setError(null); setBusy(true);
    const r = await adminCall('/tables', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), smallBlind: sb, bigBlind: bb, buyIn, maxPlayers, allowSpectators: false }),
    });
    setBusy(false);
    if (r.status === 200) onDone();
    else setError(r.body.error ?? 'failed');
  }
  return (
    <Modal open onClose={onClose} title={t('admin.newTable')} subtitle={t('admin.prompt.presetHint')} width="lg"
           footer={<DialogFooter onCancel={onClose} onSubmit={submit} busy={busy} submitLabel={t('admin.newTable')} />}>
      {/* Preset grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TABLE_PRESETS.map((p) => {
          const active = activePreset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className={
                'rounded-lg p-3 text-left border transition ' +
                (active
                  ? 'border-gold/60 bg-gold/10 shadow-gold-soft'
                  : 'border-rim-bright hover:border-gold/40 hover:bg-gold/[0.04]')
              }
            >
              <div className="font-display text-sm tracking-wider text-gold">
                {p.name}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-ink-muted mt-1 font-mono">
                {p.sb}/{p.bb} · {p.buyIn.toLocaleString()} · {p.maxPlayers}p
              </div>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-rim-bright my-2" />

      <NeonInput id="t-name" label={t('admin.prompt.tableName')} value={name}
                 onChange={(e) => { setName(e.target.value); setActivePreset(null); }}
                 autoFocus error={error} />
      <div className="grid grid-cols-2 gap-3">
        <NeonInput id="t-sb" label={t('admin.prompt.tableSb')} type="number" inputMode="numeric"
                   value={String(sb)}
                   onChange={(e) => { setSb(Number(e.target.value) || 0); setActivePreset(null); }} />
        <NeonInput id="t-bb" label={t('admin.prompt.tableBb')} type="number" inputMode="numeric"
                   value={String(bb)}
                   onChange={(e) => { setBb(Number(e.target.value) || 0); setActivePreset(null); }} />
        <NeonInput id="t-buyin" label={t('admin.prompt.tableBuyIn')} type="number" inputMode="numeric"
                   value={String(buyIn)}
                   onChange={(e) => { setBuyIn(Number(e.target.value) || 0); setActivePreset(null); }} />
        <div>
          <label className="block text-[10px] uppercase tracking-[0.22em] text-ink-muted font-display mb-1">
            {t('admin.prompt.tableMax')}
          </label>
          <select
            value={maxPlayers}
            onChange={(e) => { setMaxPlayers(Number(e.target.value)); setActivePreset(null); }}
            className="w-full px-2 py-2 rounded-md bg-obsidian-bg border border-rim-bright font-mono text-sm text-gold"
          >
            <option value={2}>{t('admin.prompt.tableMaxOpt.headsUp')}</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
            <option value={6}>{t('admin.prompt.tableMaxOpt.sixMax')}</option>
            <option value={7}>7</option>
            <option value={8}>8</option>
            <option value={9}>{t('admin.prompt.tableMaxOpt.nineMax')}</option>
            <option value={10}>{t('admin.prompt.tableMaxOpt.fullRing')}</option>
          </select>
          <p className="mt-1 text-[10px] text-ink-muted">
            {t('admin.prompt.tableMaxHint')}
          </p>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Edit-table dialog. Same fields as CreateTableDialog but pre-filled
 * from the existing row, no preset grid (presets are for create-flow
 * speed; an edit is a targeted change to one existing table). PUT
 * /admin/tables/:id merges the patch, validates BB > SB + buy-in
 * floor + max-players ≥ seated count, mirrors into the in-memory
 * PokerTable.cfg, and broadcasts the new state so live players see
 * the updated stake labels.
 */
function EditTableDialog({
  table,
  onClose,
  onDone,
}: {
  table: TableRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(table.name);
  const [sb, setSb] = useState(Number(table.small_blind));
  const [bb, setBb] = useState(Number(table.big_blind));
  const [buyIn, setBuyIn] = useState(Number(table.buy_in));
  const [maxPlayers, setMaxPlayers] = useState(table.max_players);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    const r = await adminCall(`/tables/${table.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: name.trim(),
        smallBlind: sb,
        bigBlind: bb,
        buyIn,
        maxPlayers,
      }),
    });
    setBusy(false);
    if (r.status === 200) {
      onDone();
      return;
    }
    if (r.body.error === 'max_players_below_seated') {
      setError(t('admin.prompt.tableEditErr.belowSeated'));
    } else if (r.body.error === 'big_blind_must_exceed_small') {
      setError(t('admin.prompt.tableEditErr.bbVsSb'));
    } else if (r.body.error === 'buy_in_too_low') {
      setError(t('admin.prompt.tableEditErr.buyInLow'));
    } else if (r.body.error === 'table_archived') {
      setError(t('admin.prompt.tableEditErr.archived'));
    } else {
      setError(r.body.error ?? 'failed');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.prompt.tableEditTitle', { name: table.name })}
      subtitle={t('admin.prompt.tableEditBody')}
      width="lg"
      footer={
        <DialogFooter
          onCancel={onClose}
          onSubmit={submit}
          busy={busy}
          submitLabel={t('admin.tableEditSave')}
          variant="gold"
        />
      }
    >
      <NeonInput
        id="te-name"
        label={t('admin.prompt.tableName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        error={error}
      />
      <div className="grid grid-cols-2 gap-3">
        <NeonInput
          id="te-sb"
          label={t('admin.prompt.tableSb')}
          type="number"
          inputMode="numeric"
          value={String(sb)}
          onChange={(e) => setSb(Number(e.target.value) || 0)}
        />
        <NeonInput
          id="te-bb"
          label={t('admin.prompt.tableBb')}
          type="number"
          inputMode="numeric"
          value={String(bb)}
          onChange={(e) => setBb(Number(e.target.value) || 0)}
        />
        <NeonInput
          id="te-buyin"
          label={t('admin.prompt.tableBuyIn')}
          type="number"
          inputMode="numeric"
          value={String(buyIn)}
          onChange={(e) => setBuyIn(Number(e.target.value) || 0)}
        />
        <div>
          <label className="block text-[10px] uppercase tracking-[0.22em] text-ink-muted font-display mb-1">
            {t('admin.prompt.tableMax')}
          </label>
          <select
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="w-full px-2 py-2 rounded-md bg-obsidian-bg border border-rim-bright font-mono text-sm text-gold"
          >
            <option value={2}>{t('admin.prompt.tableMaxOpt.headsUp')}</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
            <option value={6}>{t('admin.prompt.tableMaxOpt.sixMax')}</option>
            <option value={7}>7</option>
            <option value={8}>8</option>
            <option value={9}>{t('admin.prompt.tableMaxOpt.nineMax')}</option>
            <option value={10}>{t('admin.prompt.tableMaxOpt.fullRing')}</option>
          </select>
          <p className="mt-1 text-[10px] text-ink-muted">
            {t('admin.prompt.tableEditMaxHint', { seated: String(table.seated) })}
          </p>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDialog({ title, subtitle, confirmLabel, variant, onClose, onConfirm }: {
  title: string; subtitle?: string; confirmLabel: string;
  variant?: 'gold' | 'primary' | 'danger';
  onClose: () => void; onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle}
           footer={<DialogFooter onCancel={onClose}
                                 onSubmit={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
                                 busy={busy} submitLabel={confirmLabel} variant={variant} />}>
      {/* body intentionally empty — title + subtitle carry the message */}
    </Modal>
  );
}

/**
 * Single row in the admin ads list. Shows the ad's visual identity
 * (icon, kicker, headline + first line of body), its sort_order and
 * active state, plus inline Toggle / Edit / Delete buttons.
 */
function AdRowCmp({
  ad,
  onEdit,
  onToggle,
  onDelete,
}: {
  ad: AdRow;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const toneBorder = ad.tone === 'alert'
    ? 'border-status-alert/40'
    : ad.tone === 'smoky'
    ? 'border-rim-faint'
    : 'border-gold/40';
  const toneIcon = ad.tone === 'alert'
    ? 'bg-status-alert/10 border-status-alert/40 text-status-alert'
    : ad.tone === 'smoky'
    ? 'bg-obsidian-soft border-rim-faint text-ink-secondary'
    : 'bg-gold/10 border-gold/40 text-gold';
  return (
    <div
      className={clsx(
        'rounded-xl border p-3 flex items-start gap-3 transition-opacity',
        toneBorder,
        !ad.is_active && 'opacity-50',
      )}
    >
      <div
        className={clsx(
          'shrink-0 w-10 h-10 rounded-full border flex items-center justify-center text-xl',
          toneIcon,
        )}
      >
        {ad.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[9px] uppercase tracking-[0.32em] font-display text-ink-muted">
            #{ad.sort_order} · {ad.tone}
          </span>
          {!ad.is_active && (
            <span className="text-[9px] uppercase tracking-[0.22em] text-status-alert/80 font-display">
              {t('admin.ads.inactive')}
            </span>
          )}
        </div>
        <div className="font-display text-sm sm:text-base text-ink-primary truncate leading-tight mt-0.5">
          {ad.headline}
        </div>
        <div className="text-[11px] text-ink-muted leading-snug line-clamp-2 mt-0.5">
          {ad.kicker} — {ad.body}
        </div>
        {ad.disclaimer && (
          <div className="text-[10px] italic text-ink-muted/70 mt-1 line-clamp-1">
            {ad.disclaimer}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <NeonButton size="sm" variant="ghost" onClick={onToggle}>
          {ad.is_active ? t('admin.ads.hide') : t('admin.ads.show')}
        </NeonButton>
        <NeonButton size="sm" variant="ghost" onClick={onEdit}>
          {t('admin.ads.edit')}
        </NeonButton>
        <NeonButton size="sm" variant="danger" onClick={onDelete}>
          {t('admin.ads.delete')}
        </NeonButton>
      </div>
    </div>
  );
}

/**
 * Edit / create dialog for a fake-ad. New ad has ad=null, edit passes
 * the existing row. Submit posts the form to /admin/ads (POST or PUT).
 */
function AdEditDialog({
  ad,
  onClose,
  onSave,
}: {
  ad: AdRow | null;
  onClose: () => void;
  onSave: (ad: Partial<AdRow> & { id?: string }) => Promise<void>;
}) {
  const t = useT();
  const [kicker, setKicker] = useState(ad?.kicker ?? '');
  const [headline, setHeadline] = useState(ad?.headline ?? '');
  const [body, setBody] = useState(ad?.body ?? '');
  const [disclaimer, setDisclaimer] = useState(ad?.disclaimer ?? '');
  const [icon, setIcon] = useState(ad?.icon ?? '✨');
  const [tone, setTone] = useState<'gold' | 'smoky' | 'alert'>(ad?.tone ?? 'gold');
  const [sortOrder, setSortOrder] = useState<number>(ad?.sort_order ?? 100);
  const [isActive, setIsActive] = useState<boolean>(ad?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  const valid = kicker.trim().length > 0 && headline.trim().length > 0 && body.trim().length > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    await onSave({
      id: ad?.id,
      kicker: kicker.trim(),
      headline: headline.trim(),
      body: body.trim(),
      disclaimer: disclaimer.trim() || null,
      icon: icon.trim() || '✨',
      tone,
      sort_order: sortOrder,
      is_active: isActive,
    });
    setBusy(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ad ? t('admin.ads.editTitle') : t('admin.ads.newTitle')}
      subtitle={t('admin.ads.editSubtitle')}
      footer={
        <DialogFooter
          onCancel={onClose}
          onSubmit={submit}
          busy={busy}
          submitLabel={ad ? t('admin.ads.save') : t('admin.ads.create')}
          variant="gold"
        />
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <NeonInput
          id="ad-icon"
          label={t('admin.ads.field.icon')}
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          hint={t('admin.ads.field.iconHint')}
        />
        <div>
          <label className="block text-[10px] uppercase tracking-[0.22em] text-ink-muted font-display mb-1">
            {t('admin.ads.field.tone')}
          </label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as 'gold' | 'smoky' | 'alert')}
            className="w-full px-2 py-1.5 rounded-md bg-obsidian-bg border border-rim-bright font-mono text-sm text-gold"
          >
            <option value="gold">gold</option>
            <option value="smoky">smoky</option>
            <option value="alert">alert</option>
          </select>
        </div>
      </div>
      <NeonInput
        id="ad-kicker"
        label={t('admin.ads.field.kicker')}
        value={kicker}
        onChange={(e) => setKicker(e.target.value)}
        hint={t('admin.ads.field.kickerHint')}
      />
      <NeonInput
        id="ad-headline"
        label={t('admin.ads.field.headline')}
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        hint={t('admin.ads.field.headlineHint')}
      />
      <div>
        <label className="block text-[10px] uppercase tracking-[0.22em] text-ink-muted font-display mb-1">
          {t('admin.ads.field.body')}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full px-2 py-1.5 rounded-md bg-obsidian-bg border border-rim-bright font-mono text-sm text-ink-primary"
          placeholder={t('admin.ads.field.bodyHint')}
        />
      </div>
      <NeonInput
        id="ad-disclaimer"
        label={t('admin.ads.field.disclaimer')}
        value={disclaimer}
        onChange={(e) => setDisclaimer(e.target.value)}
        hint={t('admin.ads.field.disclaimerHint')}
      />
      <div className="grid grid-cols-2 gap-3 items-end">
        <NeonInput
          id="ad-sort"
          type="number"
          label={t('admin.ads.field.sortOrder')}
          value={String(sortOrder)}
          onChange={(e) => setSortOrder(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          hint={t('admin.ads.field.sortOrderHint')}
        />
        <label className="flex items-center gap-2 cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 accent-gold"
          />
          <span className="text-sm font-display text-ink-primary">
            {t('admin.ads.field.active')}
          </span>
        </label>
      </div>
    </Modal>
  );
}
