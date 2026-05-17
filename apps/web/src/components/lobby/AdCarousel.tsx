'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Ad {
  /** Top kicker — small uppercase label like a real promo banner. */
  kicker: string;
  /** Bold headline copy. */
  headline: string;
  /** Supporting sub-copy. */
  body: string;
  /** Right-side icon glyph (emoji or single char). */
  icon: string;
  /** Optional joke disclaimer rendered in tiny grey below the body. */
  disclaimer?: string;
  /** Visual tier — gold = premium, smoky = subtle, alert = "limited time" */
  tone?: 'gold' | 'smoky' | 'alert';
}

/**
 * Lobby ad carousel. Rotates every 6 s; pauses on hover (desktop) and
 * while a touch is held (mobile). All visuals are inline-styled so
 * Tailwind compilation or stale-cache JIT can't strip them — earlier
 * iterations relied on `bg-gold/[0.06]` which essentially vanished
 * against the near-black page background.
 *
 * Three controls expose manual navigation:
 *   - ‹ / › chevron buttons on the left + right (hidden on tiny phones
 *     where the slot is too narrow; gesture-friendly tap targets).
 *   - Pagination pills below the card, sized larger than the previous
 *     tiny dots so they're actually tappable.
 *   - Auto-rotation pauses while the user interacts.
 */
export function AdCarousel({
  ads,
  intervalMs = 6000,
}: {
  ads: Ad[];
  intervalMs?: number;
}) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const adsLen = ads.length;

  const go = useCallback(
    (delta: number) => {
      if (adsLen === 0) return;
      setIdx((i) => (i + delta + adsLen) % adsLen);
    },
    [adsLen],
  );

  useEffect(() => {
    setIdx((i) => (i >= adsLen && adsLen > 0 ? 0 : i));
  }, [adsLen]);

  // Chained setTimeout (not setInterval) so Telegram WebView's tab-
  // throttling doesn't stall the wheel. Paused while a pointer is over
  // the carousel so the user can read the current ad in peace.
  useEffect(() => {
    if (adsLen < 2 || paused) return;
    const id = setTimeout(() => {
      setIdx((i) => (i + 1) % adsLen);
    }, intervalMs);
    return () => clearTimeout(id);
  }, [idx, adsLen, intervalMs, paused]);

  if (adsLen === 0) return null;
  const ad = ads[idx] ?? ads[0]!;

  // Tone palette — all opaque so nothing depends on alpha blending
  // against a dark page that already eats faint tints.
  const tone = ad.tone ?? 'gold';
  const palette = {
    gold: {
      bg: 'linear-gradient(135deg, #1c1a10 0%, #221c0e 100%)',
      border: 'rgba(212,175,55,0.85)',
      iconBg: 'rgba(212,175,55,0.18)',
      iconBorder: 'rgba(212,175,55,0.6)',
      kicker: 'rgba(212,175,55,0.9)',
      glow: '0 0 24px -8px rgba(212,175,55,0.45)',
    },
    smoky: {
      bg: 'linear-gradient(135deg, #15151c 0%, #1a1a22 100%)',
      border: 'rgba(212,175,55,0.45)',
      iconBg: 'rgba(255,255,255,0.05)',
      iconBorder: 'rgba(255,255,255,0.18)',
      kicker: 'rgba(170,170,180,0.85)',
      glow: undefined,
    },
    alert: {
      bg: 'linear-gradient(135deg, #2a1414 0%, #321616 100%)',
      border: 'rgba(255,90,90,0.7)',
      iconBg: 'rgba(255,90,90,0.16)',
      iconBorder: 'rgba(255,90,90,0.55)',
      kicker: 'rgba(255,140,140,0.95)',
      glow: '0 0 20px -8px rgba(255,90,90,0.35)',
    },
  }[tone];

  const arrowStyle: React.CSSProperties = {
    backgroundColor: 'rgba(0,0,0,0.55)',
    border: `1px solid ${palette.border}`,
    color: '#e8d99c',
  };

  return (
    <div
      className="relative w-full select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div
        className="rounded-2xl px-3 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 relative"
        style={{
          minHeight: 96,
          background: palette.bg,
          border: `2px solid ${palette.border}`,
          boxShadow: palette.glow,
          color: '#f6f3e9',
        }}
      >
        {/* Previous-ad chevron — hidden on tight phones so it doesn't
            steal width from the icon + text. Tab order skips it via
            tabIndex=-1 (the dots below still grant keyboard access). */}
        {adsLen > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous ad"
            tabIndex={-1}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full items-center justify-center text-xl leading-none hover:scale-110 active:scale-95 transition-transform"
            style={arrowStyle}
          >
            ‹
          </button>
        )}

        {/* Icon disc */}
        <div
          className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-2xl sm:text-3xl sm:ml-8"
          style={{
            backgroundColor: palette.iconBg,
            border: `1px solid ${palette.iconBorder}`,
          }}
        >
          {ad.icon}
        </div>

        {/* Text column */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.28em] font-display font-medium"
            style={{ color: palette.kicker }}
          >
            {ad.kicker}
          </div>
          <div
            className="font-display text-sm sm:text-base font-semibold truncate leading-tight mt-0.5"
            style={{ color: '#f6f3e9' }}
          >
            {ad.headline}
          </div>
          <div
            className="text-[11px] sm:text-xs mt-0.5 leading-snug line-clamp-2"
            style={{ color: 'rgba(220,220,225,0.85)' }}
          >
            {ad.body}
          </div>
          {ad.disclaimer && (
            <div
              className="text-[9px] italic mt-1 line-clamp-1"
              style={{ color: 'rgba(170,170,180,0.7)' }}
            >
              {ad.disclaimer}
            </div>
          )}
        </div>

        {adsLen > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next ad"
            tabIndex={-1}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full items-center justify-center text-xl leading-none hover:scale-110 active:scale-95 transition-transform sm:mr-0"
            style={arrowStyle}
          >
            ›
          </button>
        )}
      </div>

      {/* Pagination pills — larger and with bigger touch-targets than
          the previous 6-px dots. The button is sized larger via padding
          so a fingertip lands cleanly even when the visible bar is small. */}
      {adsLen > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          {ads.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Show ad ${i + 1}`}
              className="px-1 py-2 -my-1 group"
              style={{ touchAction: 'manipulation' }}
            >
              <span
                className="block rounded-full transition-all"
                style={{
                  height: 4,
                  width: i === idx ? 28 : 10,
                  backgroundColor:
                    i === idx ? 'rgba(212,175,55,0.95)' : 'rgba(212,175,55,0.28)',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
