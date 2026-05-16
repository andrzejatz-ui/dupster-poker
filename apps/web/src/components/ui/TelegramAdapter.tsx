'use client';

import { useEffect } from 'react';

/**
 * Telegram Mini Apps integration.
 *
 * When the page is opened inside the Telegram client (via a bot's menu
 * button or a t.me/<bot>/<app> deep link), `window.Telegram.WebApp` is
 * present. We use it to:
 *
 *  - Call `ready()` so Telegram stops showing the loading shimmer
 *  - Call `expand()` so the webview takes the full vertical space
 *    instead of the half-height default
 *  - Wire `viewportStableHeight` into the CSS variable --app-height so
 *    every full-height container (felt, modals, the lobby) sizes to the
 *    actually-usable area instead of 100dvh (which includes Telegram's
 *    own header bar and bottom nav, leaving the action bar offscreen)
 *  - Mirror Telegram's current theme into the app: header colour,
 *    background colour. We keep the obsidian-on-gold look — we just
 *    push our own colours back into Telegram so the Telegram chrome
 *    blends with the felt instead of clashing
 *  - Add a tiny `tg-mini` class on <html> so we can selectively tweak
 *    layout (e.g. hide the redundant "← Back" link since Telegram has
 *    its own back button)
 *
 * Outside Telegram the script load fails silently and we fall back to
 * the regular 100dvh sizing — no behavioural change for browser users.
 */
export function TelegramAdapter() {
  useEffect(() => {
    // Load the official SDK script. Cheap (≈4 KB), CDN-cached.
    const SCRIPT_ID = 'telegram-web-app-sdk';
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement('script');
      s.id = SCRIPT_ID;
      s.src = 'https://telegram.org/js/telegram-web-app.js';
      s.async = true;
      s.onload = init;
      document.head.appendChild(s);
    } else {
      init();
    }

    function init() {
      const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } })
        .Telegram?.WebApp;
      if (!tg) {
        // Not running inside Telegram — keep CSS fallback (100dvh).
        return;
      }

      document.documentElement.classList.add('tg-mini');
      try { tg.ready(); } catch { /* ignore */ }
      try { tg.expand(); } catch { /* ignore */ }

      // Match Telegram chrome to our obsidian theme so the seams vanish.
      try { tg.setHeaderColor?.('#09090b'); } catch { /* ignore */ }
      try { tg.setBackgroundColor?.('#09090b'); } catch { /* ignore */ }

      // Push the usable height into a CSS var so .app-height containers
      // get the correct size on every viewport change (keyboard open,
      // orientation flip, Telegram pull-down etc.).
      const applyHeight = () => {
        const h = tg.viewportStableHeight ?? tg.viewportHeight ?? window.innerHeight;
        document.documentElement.style.setProperty('--app-height', `${h}px`);
      };
      applyHeight();
      tg.onEvent?.('viewportChanged', applyHeight);
      tg.onEvent?.('themeChanged', applyHeight);
      window.addEventListener('resize', applyHeight);
    }
  }, []);

  return null;
}

/* ---- Minimal type stub for window.Telegram.WebApp ----------------
 * We don't pull in @telegram/web-app types for one component — these
 * are the four members we actually touch. */
interface TgWebApp {
  ready: () => void;
  expand: () => void;
  viewportHeight?: number;
  viewportStableHeight?: number;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  onEvent?: (name: string, cb: () => void) => void;
}
