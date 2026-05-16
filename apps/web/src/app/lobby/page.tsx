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
import { ChipRequestModal } from '@/components/table/ChipRequestModal';
import { getAdminToken } from '@/lib/admin';
import { useT } from '@/i18n/context';
import clsx from 'clsx';
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
  /** Stake-tier filter — controls which table cards are visible. */
  const [filterTier, setFilterTier] = useState<'all' | 'micro' | 'low' | 'mid' | 'high' | 'nosebleed'>('all');
  /** Future-product tab — only the cash one is active today. */
  const [activeTab, setActiveTab] = useState<'cash' | 'tournament' | 'sng'>('cash');
  /** Chip-request modal — opens when wallet runs dry or via header button. */
  const [chipReqOpen, setChipReqOpen] = useState(false);

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

  /** Sends the same chip_request the table page uses — Promise wrapper
   *  so ChipRequestModal can await the ack and toast a result. */
  function sendChipRequest(args: { amount?: number; message?: string }): Promise<
    | { ok: true }
    | { ok: false; error: string }
  > {
    return new Promise((resolve) => {
      if (!socket) {
        resolve({ ok: false, error: 'no_socket' });
        return;
      }
      socket.emit('client:player:chip_request', args, (res) => {
        if (res.ok) resolve({ ok: true });
        else resolve({ ok: false, error: res.error });
      });
    });
  }

  /** Same stake-tier classification as TableCard so the filter
   *  pills match the kicker labels on the cards. */
  function stakeTier(bb: number): 'micro' | 'low' | 'mid' | 'high' | 'nosebleed' {
    if (bb <= 10) return 'micro';
    if (bb <= 100) return 'low';
    if (bb <= 500) return 'mid';
    if (bb <= 2000) return 'high';
    return 'nosebleed';
  }
  const visibleTables = tables.filter((tbl) =>
    filterTier === 'all' ? true : stakeTier(tbl.bigBlind) === filterTier,
  );

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
          {!pending && (profile?.chips ?? 0) > 0 && (
            <NeonButton variant="ghost" size="sm" onClick={() => setChipReqOpen(true)}>
              🙋 <span className="hidden sm:inline ml-1">{t('action.requestChips')}</span>
            </NeonButton>
          )}
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

      {/* ───────────── CINEMATIC HERO ─────────────────
          Big eye with halo, brand wordmark, wallet + live counters.
          The .lobby-hero CSS adds a drifting gold glow + soft pulse
          so the panel feels alive without distracting. */}
      {!pending && (
        <section className="lobby-hero px-4 sm:px-6 py-5 sm:py-7 mb-4 shrink-0">
          <div className="relative flex flex-col items-center text-center">
            <div className="hero-eye-halo mb-2">
              <Eye size={84} />
            </div>
            <h2 className="font-display text-2xl sm:text-3xl text-gold text-glow-gold tracking-[0.32em] mt-1">
              BLUFFUMINATI
            </h2>
            <p className="text-xs sm:text-sm tracking-[0.18em] text-gold/70 font-display italic mt-0.5">
              by filipOS
            </p>

            {/* Stat row */}
            <div className="mt-4 sm:mt-5 flex items-end justify-center gap-5 sm:gap-8 flex-wrap">
              <HeroStat
                label={t('lobby.hero.wallet')}
                value={(profile?.chips ?? 0).toLocaleString()}
                accent="gold"
              />
              <div className="w-px h-10 bg-rim-bright/40 hidden sm:block" />
              <HeroStat
                label={t('lobby.stats.tables')}
                value={String(tables.length)}
              />
              <div className="w-px h-10 bg-rim-bright/40 hidden sm:block" />
              <HeroStat
                label={t('lobby.stats.seated')}
                value={`${totalSeated}/${totalSeats}`}
              />
              <div className="w-px h-10 bg-rim-bright/40 hidden sm:block" />
              <HeroStat
                label={t('lobby.stats.inHand')}
                value={String(inHandCount)}
                accent="alert"
              />
            </div>
          </div>
        </section>
      )}

      {/* ───────────── CHIP-REQUEST PANEL (wallet empty) ─────────────
          Only renders when the wallet is below a single big-blind unit
          across all tables — at that point the player can't even buy
          into the cheapest game. Big gold-bordered nudge to ping the
          admin for chips. */}
      {!pending && profile && profile.chips < 50 && tables.length > 0 && (
        <div className="surface-strong rounded-2xl border border-gold/55 px-4 sm:px-5 py-3 sm:py-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-gold-strong shrink-0">
          <div className="text-3xl shrink-0">💸</div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-sm sm:text-base text-gold text-glow-gold">
              {t('lobby.outOfChips.title')}
            </div>
            <div className="text-[11px] sm:text-xs text-ink-secondary mt-0.5">
              {t('lobby.outOfChips.body')}
            </div>
          </div>
          <NeonButton
            variant="gold"
            size="md"
            onClick={() => setChipReqOpen(true)}
            className="shrink-0"
          >
            🙋 {t('action.requestChips')}
          </NeonButton>
        </div>
      )}

      {/* ───────────── TAB BAR ─────────────────────────
          Three product tabs — only "Cash games" is active today, the
          others carry a Coming Soon badge so the page reads as a real
          poker client setting up future product lines. */}
      {!pending && (
        <nav className="flex items-center gap-2 sm:gap-4 border-b border-rim-faint mb-3 sm:mb-4 shrink-0 overflow-x-auto">
          <button
            type="button"
            className={clsx('lobby-tab', activeTab === 'cash' && 'lobby-tab--active')}
            onClick={() => setActiveTab('cash')}
          >
            {t('lobby.tabs.cash')}
          </button>
          <button
            type="button"
            className="lobby-tab lobby-tab--locked"
            onClick={(e) => e.preventDefault()}
            disabled
          >
            {t('lobby.tabs.tournaments')}
            <span className="lobby-tab__badge">{t('lobby.tabs.soon')}</span>
          </button>
          <button
            type="button"
            className="lobby-tab lobby-tab--locked"
            onClick={(e) => e.preventDefault()}
            disabled
          >
            {t('lobby.tabs.sng')}
            <span className="lobby-tab__badge">{t('lobby.tabs.soon')}</span>
          </button>
        </nav>
      )}

      {/* ───────────── FILTER PILLS ───────────────────
          Stake-tier filter; the labels match the kicker label on each
          TableCard so it's visually consistent. */}
      {!pending && tables.length > 0 && (
        <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 overflow-x-auto pb-1 shrink-0">
          {(['all', 'micro', 'low', 'mid', 'high', 'nosebleed'] as const).map((tier) => {
            const count = tier === 'all'
              ? tables.length
              : tables.filter((tbl) => stakeTier(tbl.bigBlind) === tier).length;
            if (tier !== 'all' && count === 0) return null;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => setFilterTier(tier)}
                className={clsx('filter-pill', filterTier === tier && 'filter-pill--active')}
              >
                {t(`lobby.filter.${tier}`)}
                <span className="ml-1.5 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ───────────── TABLE GRID + AD CAROUSEL ────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
        {pending ? (
          <NeonCard glow="cyan" strong className="text-center">
            <h2 className="text-xl font-display mb-2">{t('lobby.pending.title')}</h2>
            <p className="text-white/55 text-sm">{t('lobby.pending.body')}</p>
          </NeonCard>
        ) : tables.length === 0 ? (
          <NeonCard className="text-center">
            <p className="text-white/55">{t('lobby.empty')}</p>
          </NeonCard>
        ) : visibleTables.length === 0 ? (
          <NeonCard className="text-center">
            <p className="text-white/55">{t('lobby.noFilterMatch')}</p>
          </NeonCard>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {visibleTables.map((tbl) => (
                <TableCard key={tbl.id} table={tbl} onJoin={() => join(tbl)} />
              ))}
            </div>
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

      {chipReqOpen && (
        <ChipRequestModal
          bigBlind={tables[0]?.bigBlind ?? 10}
          buyIn={tables[0]?.buyIn ?? 500}
          onClose={() => setChipReqOpen(false)}
          onSubmit={sendChipRequest}
        />
      )}
    </main>
  );
}

/**
 * Compact stat tile for the hero — uppercase label above, mono value
 * below, optional accent colour. Stack of these reads as a casino-style
 * info strip ("Wallet · Tables · Seated · In hand").
 */
function HeroStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'gold' | 'alert';
}) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.32em] text-ink-muted font-display">
        {label}
      </span>
      <span
        className={clsx(
          'font-display text-lg sm:text-2xl mt-0.5 font-mono',
          accent === 'gold'
            ? 'text-gold text-glow-gold'
            : accent === 'alert'
            ? 'text-status-alert'
            : 'text-ink-primary',
        )}
      >
        {value}
      </span>
    </div>
  );
}
