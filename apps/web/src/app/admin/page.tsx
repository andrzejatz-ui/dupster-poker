'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Signature } from '@/components/ui/Signature';
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
  seat_table_id: string | null;
  seat_index: number | null;
  seat_stack: string | null;
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

type Dialog =
  | null
  | { kind: 'play' }
  | { kind: 'approve'; player: PlayerRow }
  | { kind: 'chips'; player: PlayerRow }
  | { kind: 'ban'; player: PlayerRow }
  | { kind: 'reject'; player: PlayerRow }
  | { kind: 'password'; player: PlayerRow }
  | { kind: 'createTable' }
  | { kind: 'closeTable'; table: TableRow };

export default function AdminDashboard() {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState<PlayerRow[]>([]);
  const [approved, setApproved] = useState<PlayerRow[]>([]);
  const [banned, setBanned] = useState<PlayerRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);

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
      const a = await adminCall('/players?status=pending');
      const b = await adminCall('/players?status=approved');
      const c = await adminCall('/players?status=banned');
      const ts = await adminCall('/tables');
      if (a.status === 401) { clearAdminToken(); router.replace('/admin/login'); return; }
      setPending(a.body.players ?? []);
      setApproved(b.body.players ?? []);
      setBanned(c.body.players ?? []);
      setTables(ts.body.tables ?? []);
    } catch {/* ignore */}
  }

  function logout() {
    clearAdminToken();
    router.replace('/admin/login');
  }

  async function pauseToggle(table: TableRow) {
    await adminCall(`/tables/${table.id}/${table.is_paused ? 'resume' : 'pause'}`, { method: 'POST' });
    refresh();
  }

  return (
    <>
      <main className="min-h-screen px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between pr-24 sm:pr-36">
          <div>
            <h1 className="font-display text-3xl text-gold text-glow-gold">
              {t('admin.title')}
            </h1>
            <p className="text-ink-muted text-xs">
              {t('admin.counts', {
                pending: pending.length,
                approved: approved.length,
                banned: banned.length,
                tables: tables.filter(x => !x.archived_at).length,
              })}
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3 flex-wrap justify-end">
            <NeonButton variant="gold" size="sm" onClick={() => setDialog({ kind: 'play' })}>
              ▶ {t('admin.play')}
            </NeonButton>
            <Link href="/admin/audit">
              <NeonButton variant="ghost" size="sm">{t('admin.auditButton')}</NeonButton>
            </Link>
            <NeonButton variant="ghost" size="sm" onClick={logout}>{t('admin.logout')}</NeonButton>
          </div>
        </header>

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

        {/* Approved + Banned */}
        <NeonCard glow="gold">
          <SectionTitle title={t('admin.players')} count={approved.length + banned.length} />
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[760px]">
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
                    <td className="text-right font-mono text-gold">
                      {Number(p.chips).toLocaleString()}
                    </td>
                    <td className="text-right space-x-2 whitespace-nowrap">
                      <NeonButton size="sm" variant="ghost" onClick={() => setDialog({ kind: 'password', player: p })}>
                        {p.password ? t('admin.passwordReset') : t('admin.passwordSet')}
                      </NeonButton>
                      <NeonButton size="sm" variant="ghost" onClick={() => setDialog({ kind: 'chips', player: p })}>
                        {t('admin.chipsAdjust')}
                      </NeonButton>
                      {p.seat_table_id && (
                        <NeonButton
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            await adminCall(`/players/${p.id}/kick`, { method: 'POST' });
                            refresh();
                          }}
                        >
                          {t('admin.kick')}
                        </NeonButton>
                      )}
                      <NeonButton
                        size="sm"
                        variant={p.status === 'banned' ? 'primary' : 'danger'}
                        onClick={async () => {
                          if (p.status === 'banned') {
                            await adminCall(`/players/${p.id}/unban`, { method: 'POST' });
                            refresh();
                          } else {
                            setDialog({ kind: 'ban', player: p });
                          }
                        }}
                      >
                        {p.status === 'banned' ? t('admin.unban') : t('admin.ban')}
                      </NeonButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                            <NeonButton size="sm" variant="ghost" onClick={() => pauseToggle(tbl)}>
                              {tbl.is_paused ? t('admin.tableResume') : t('admin.tablePause')}
                            </NeonButton>
                            <NeonButton size="sm" variant="danger" onClick={() => setDialog({ kind: 'closeTable', table: tbl })}>
                              {t('admin.tableClose')}
                            </NeonButton>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NeonCard>
        <Signature className="mt-8 pb-6" />
      </main>

      {/* ---- Dialogs ---- */}
      {dialog?.kind === 'play' && (
        <PlayDialog
          onClose={() => setDialog(null)}
          onDone={(profile, token) => {
            setSession(token, profile);
            router.push('/lobby');
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
    </>
  );
}

/* ---------- presentational helpers ---------- */

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

function PlayDialog({ onClose, onDone }: {
  onClose: () => void;
  onDone: (profile: { id: string; handle: string; displayName: string | null; chips: number }, token: string) => void;
}) {
  const t = useT();
  const [handle, setHandle] = useState('admin');
  const [chips, setChips] = useState(10000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null); setBusy(true);
    const r = await adminCall('/play', {
      method: 'POST',
      body: JSON.stringify({ playerHandle: handle.trim(), displayName: handle.trim(), initialChips: chips }),
    });
    setBusy(false);
    if (r.status === 200 && r.body.token) onDone(r.body.profile, r.body.token);
    else setError(r.body.error ?? 'failed');
  }
  return (
    <Modal open onClose={onClose} title={t('admin.play')} subtitle={t('admin.prompt.playHandle')}
           footer={<DialogFooter onCancel={onClose} onSubmit={submit} busy={busy} submitLabel={t('admin.play')} />}>
      <NeonInput id="play-handle" label={t('join.idLabel')} value={handle}
                 onChange={(e) => setHandle(e.target.value)} autoFocus error={error} />
      <NeonInput id="play-chips" label={t('admin.col.chips')} type="number" inputMode="numeric"
                 value={String(chips)} onChange={(e) => setChips(Number(e.target.value) || 0)}
                 hint={t('admin.prompt.playChips')} />
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

const TABLE_PRESETS = [
  { key: 'casual',  name: 'Casual',      sb: 5,   bb: 10,  buyIn: 500,   maxPlayers: 6 },
  { key: 'standard',name: 'Standard',    sb: 25,  bb: 50,  buyIn: 2500,  maxPlayers: 6 },
  { key: 'high',    name: 'High Roller', sb: 100, bb: 200, buyIn: 10000, maxPlayers: 6 },
  { key: 'headsup', name: 'Heads-Up',    sb: 25,  bb: 50,  buyIn: 2500,  maxPlayers: 2 },
] as const;

function CreateTableDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState('Casual');
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [buyIn, setBuyIn] = useState(500);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>('casual');

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
        <NeonInput id="t-max" label={t('admin.prompt.tableMax')} type="number" inputMode="numeric"
                   value={String(maxPlayers)}
                   onChange={(e) => { setMaxPlayers(Math.min(9, Math.max(2, Number(e.target.value) || 2))); setActivePreset(null); }} />
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
