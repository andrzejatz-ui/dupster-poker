'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

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
 * Rotating fun-ad carousel that sits between the table grid and the
 * signature in the lobby. Pure-decorative — nothing here actually
 * works, the disclaimers are part of the joke. Slides every 6 seconds
 * with a soft cross-fade.
 *
 * Tone matters: gold = "premium experience" parody, smoky = quiet
 * branded line, alert = limited-time tournament parody. The mix
 * creates a sense of activity that real poker apps spend a lot of
 * design budget on.
 */
export function AdCarousel({ ads, intervalMs = 4500 }: { ads: Ad[]; intervalMs?: number }) {
  const [idx, setIdx] = useState(0);
  // Clamp idx whenever the ad list shrinks — otherwise a stale index
  // points past the new array and the carousel renders `undefined`.
  useEffect(() => {
    if (idx >= ads.length && ads.length > 0) setIdx(0);
  }, [ads.length, idx]);
  useEffect(() => {
    if (ads.length < 2) return;
    // Telegram WebView and some mobile browsers throttle setInterval
    // when the tab is briefly inactive — chained setTimeout keeps the
    // wheel turning more reliably because each tick is rescheduled
    // from a user-thread callback rather than a fixed wall-clock.
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setIdx((i) => (i + 1) % ads.length);
      id = setTimeout(tick, intervalMs);
    };
    id = setTimeout(tick, intervalMs);
    return () => clearTimeout(id);
  }, [ads.length, intervalMs]);

  if (ads.length === 0) return null;
  const ad = ads[idx] ?? ads[0]!;
  return (
    <div className="relative w-full">
      <div
        key={idx}
        className={clsx(
          'ad-card rounded-2xl px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 min-h-[78px] sm:min-h-[88px]',
          'border transition-all duration-500 animate-ad-fade',
          ad.tone === 'alert'
            ? 'border-status-alert/55 bg-status-alert/[0.06]'
            : ad.tone === 'smoky'
            ? 'border-rim-faint bg-obsidian-soft/40'
            : 'border-gold/45 bg-gold/[0.06] shadow-gold-soft',
        )}
      >
        <div
          className={clsx(
            'shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-2xl sm:text-3xl',
            ad.tone === 'alert'
              ? 'bg-status-alert/10 border border-status-alert/40'
              : ad.tone === 'smoky'
              ? 'bg-obsidian-soft border border-rim-faint'
              : 'bg-gold/10 border border-gold/40',
          )}
        >
          {ad.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={clsx(
              'text-[9px] sm:text-[10px] uppercase tracking-[0.32em] font-display',
              ad.tone === 'alert' ? 'text-status-alert/80'
              : ad.tone === 'smoky' ? 'text-ink-muted'
              : 'text-gold/80',
            )}
          >
            {ad.kicker}
          </div>
          <div className="font-display text-sm sm:text-base text-ink-primary truncate leading-tight mt-0.5">
            {ad.headline}
          </div>
          <div className="text-[11px] sm:text-xs text-ink-secondary mt-0.5 line-clamp-2">
            {ad.body}
          </div>
          {ad.disclaimer && (
            <div className="text-[9px] text-ink-muted/70 italic mt-1 line-clamp-1">
              {ad.disclaimer}
            </div>
          )}
        </div>
      </div>

      {ads.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {ads.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Ad ${i + 1}`}
              className={clsx(
                'h-1.5 rounded-full transition-all',
                i === idx
                  ? 'w-6 bg-gold/80'
                  : 'w-1.5 bg-rim-bright hover:bg-gold/40',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
