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
import { TableCard } from '@/components/lobby/TableCard';
import { AdCarousel } from '@/components/lobby/AdCarousel';
import { getAdminToken } from '@/lib/admin';
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
  /** Did this user arrive in the lobby from the admin "Play" shortcut?
   *  If so, getAdminToken() returns a value and we expose a one-tap
   *  "Back to Admin" button so the admin doesn't have to sign out
   *  + log back in to flip views. */
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(getAdminToken() !== null);
  }, []);

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

  // ---- Lobby stats strip — small live counters that read like a
  //      real cash-game lobby's "44 tables · 312 players online" line.
  const totalSeated = tables.reduce((sum, tbl) => sum + tbl.seated, 0);
  const totalSeats = tables.reduce((sum, tbl) => sum + tbl.maxPlayers, 0);
  const inHandCount = tables.filter((tbl) => tbl.inHand).length;

  // ---- Fake-ad copy — all decorative, the disclaimers ARE the joke.
  //      Localised via i18n so de/pl users see appropriate copy.
  const ads = [
    {
      kicker: t('lobby.ads.tournament.kicker'),
      headline: t('lobby.ads.tournament.headline'),
      body: t('lobby.ads.tournament.body'),
      disclaimer: t('lobby.ads.tournament.disclaimer'),
      icon: '🏆',
      tone: 'gold' as const,
    },
    {
      kicker: t('lobby.ads.tiltInsurance.kicker'),
      headline: t('lobby.ads.tiltInsurance.headline'),
      body: t('lobby.ads.tiltInsurance.body'),
      disclaimer: t('lobby.ads.tiltInsurance.disclaimer'),
      icon: '🧊',
      tone: 'smoky' as const,
    },
    {
      kicker: t('lobby.ads.botCoach.kicker'),
      headline: t('lobby.ads.botCoach.headline'),
      body: t('lobby.ads.botCoach.body'),
      disclaimer: t('lobby.ads.botCoach.disclaimer'),
      icon: '🤖',
      tone: 'smoky' as const,
    },
    {
      kicker: t('lobby.ads.brand.kicker'),
      headline: t('lobby.ads.brand.headline'),
      body: t('lobby.ads.brand.body'),
      icon: '👁',
      tone: 'gold' as const,
    },
    {
      kicker: t('lobby.ads.limited.kicker'),
      headline: t('lobby.ads.limited.headline'),
      body: t('lobby.ads.limited.body'),
      disclaimer: t('lobby.ads.limited.disclaimer'),
      icon: '⚡',
      tone: 'alert' as const,
    },
  ];

  return (
    <main className="min-h-dvh flex flex-col px-3 sm:px-6 pt-3 sm:pt-5 pb-3 max-w-6xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between mb-3 sm:mb-4 pr-24 sm:pr-36 gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border border-rim-bright hover:border-gold/70 transition surface-strong flex items-center justify-center"
          aria-label={t('lobby.editProfile')}
        >
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
            <span className="font-mono text-ink-secondary">{profile?.handle}</span>
            {' '}· <span className="text-ink-muted">{status}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <NeonButton variant="gold" size="sm" onClick={() => router.push('/admin')}>
              🛡 {t('common.backToAdmin')}
            </NeonButton>
          )}
          <NeonButton variant="ghost" onClick={logout}>
            {t('common.signOut')}
          </NeonButton>
        </div>
      </header>

      {/* Hero / wallet — premium gold panel that anchors the page */}
      {!pending && (
        <div className="surface-strong rounded-2xl shadow-gold-strong px-4 sm:px-5 py-3 sm:py-4 mb-3 sm:mb-4 shrink-0 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gold/[0.06] blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-gold/70 font-display">
                {t('lobby.hero.kicker')}
              </div>
              <div className="font-display text-base sm:text-xl text-ink-primary mt-0.5 truncate">
                {t('lobby.hero.welcome', { name: profile?.displayName ?? profile?.handle ?? '—' })}
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-[10px] uppercase tracking-[0.32em] text-ink-muted font-display">
                {t('lobby.hero.wallet')}
              </span>
              <span className="chip-bet font-display text-xl sm:text-2xl text-gold text-glow-gold">
                {(profile?.chips ?? 0).toLocaleString()}
              </span>
            </div>
          </div>
          {/* Live stats row */}
          <div className="mt-3 pt-3 border-t border-rim-faint flex items-center gap-4 sm:gap-6 text-[10px] sm:text-[11px] font-mono">
            <div className="flex items-baseline gap-1">
              <span className="text-ink-muted uppercase tracking-widest">{t('lobby.stats.tables')}</span>
              <span className="text-gold">{tables.length}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-ink-muted uppercase tracking-widest">{t('lobby.stats.seated')}</span>
              <span className="text-gold">{totalSeated}<span className="text-ink-muted">/{totalSeats}</span></span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-ink-muted uppercase tracking-widest">{t('lobby.stats.inHand')}</span>
              <span className="text-status-alert">{inHandCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tables grid — flex-1 so it takes available vertical space */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 sm:space-y-4">
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
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {tables.map((tbl) => (
                <TableCard key={tbl.id} table={tbl} onJoin={() => join(tbl)} />
              ))}
            </div>
            {/* Fun-ad carousel — rotates between five branded jokes
                every 6.5s. Purely decorative; the disclaimers ARE the
                joke. Adds the "this is a real product" texture
                modern poker apps lean on. */}
            <div className="mt-2 sm:mt-3">
              <AdCarousel ads={ads} />
            </div>
          </>
        )}
      </div>
      <Signature className="shrink-0 mt-3" />

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
