'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { Modal } from '@/components/ui/Modal';
import { AvatarUploader } from '@/components/ui/AvatarUploader';
import { useSocket } from '@/hooks/useSocket';
import {
  getProfile,
  clearSession,
  getToken,
  setStoredProfile,
  rememberAvatar,
  recallAvatar,
} from '@/lib/session';
import { updateAvatar } from '@/lib/api';
import { Signature } from '@/components/ui/Signature';
import { Eye } from '@/components/brand/Eye';
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
  const [profileOpen, setProfileOpen] = useState(false);

  // If the profile arrived from session storage without an avatar but
  // we have a cached one from a previous sign-in, hydrate it instantly
  // so the user sees their picture without waiting for any round-trip.
  useEffect(() => {
    if (!profile?.handle) return;
    if (profile.avatarUrl) return;
    const cached = recallAvatar(profile.handle);
    if (cached) {
      const next = { ...profile, avatarUrl: cached };
      setProfile(next);
      setStoredProfile(next);
    }
  }, [profile]);

  async function setAvatar(dataUrl: string | null) {
    const token = getToken();
    if (!token) return;
    const r = await updateAvatar(token, dataUrl);
    if (r.status === 200 && r.body.profile) {
      setProfile(r.body.profile);
      setStoredProfile(r.body.profile);
      // Mirror into long-lived storage keyed by handle.
      if (r.body.profile.handle) {
        rememberAvatar(r.body.profile.handle, r.body.profile.avatarUrl ?? null);
      }
    } else {
      throw new Error(r.body.error ?? 'upload_failed');
    }
  }

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

    socket.on('server:account:chip_update', (p) => {
      setProfile((cur) => {
        if (!cur) return cur;
        const next = { ...cur, chips: p.chips };
        setStoredProfile(next);
        return next;
      });
    });

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
    <main className="viewport-fit flex flex-col px-3 sm:px-6 pt-3 sm:pt-5 pb-2 max-w-6xl mx-auto w-full">
      <header className="flex items-center justify-between mb-3 sm:mb-5 pr-24 sm:pr-36 gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border border-rim-bright hover:border-gold/70 transition surface-strong flex items-center justify-center"
          aria-label={t('lobby.editProfile')}
        >
          {/* Brand Eye in its default sentinel look — the eye IS the
              user's avatar across the app. No photo is pushed inside. */}
          <Eye size={70} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="opacity-80 shrink-0">
              <Eye size={22} />
            </div>
            <h1 className="font-display text-xl sm:text-2xl text-gold text-glow-gold truncate">{t('lobby.title')}</h1>
          </div>
          <p className="text-ink-muted text-[11px] sm:text-xs truncate">
            {t('lobby.signedInAs')} <span className="font-mono text-ink-secondary">{profile?.handle}</span>
            {profile?.chips != null && (
              <>
                {' '}· <span className="text-gold">
                  {profile.chips.toLocaleString()} {t('lobby.chipsSuffix')}
                </span>
              </>
            )}
            {' '}· <span className="text-ink-muted">{status}</span>
          </p>
        </div>
        <NeonButton variant="ghost" onClick={logout}>
          {t('common.signOut')}
        </NeonButton>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
            {tables.map((tbl) => (
              <NeonCard key={tbl.id} glow="blue" className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg sm:text-xl">{tbl.name}</h3>
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
      </div>
      <Signature className="shrink-0 mt-2" />

      {profileOpen && (
        <Modal
          open
          onClose={() => setProfileOpen(false)}
          title={t('lobby.profileTitle')}
          subtitle={t('lobby.profileBody')}
        >
          <AvatarUploader
            current={profile?.avatarUrl ?? null}
            fallback={(profile?.handle ?? '?').slice(0, 2).toUpperCase()}
            onPick={setAvatar}
            onClear={() => setAvatar(null)}
            pickLabel={t('lobby.profileUpload')}
            clearLabel={t('lobby.profileRemove')}
            busyLabel={t('common.loading')}
          />
        </Modal>
      )}
    </main>
  );
}
