'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Almond-shaped sentinel eye that tracks the user's pointer (mouse on
 * desktop, finger on touch). The iris + pupil + catchlight live inside
 * a single <g> wrapped with a CSS transition; a global pointermove
 * listener feeds a rAF-throttled translate so the pupil glides toward
 * whichever direction the user is, without jitter or layout cost.
 *
 * Offset is capped so the iris never escapes the almond shell, no
 * matter how far the pointer is.
 */
export function Eye({ size = 32, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf: number | null = null;
    let targetX = 0;
    let targetY = 0;

    function apply() {
      raf = null;
      const g = groupRef.current;
      if (!g) return;
      g.setAttribute('transform', `translate(${targetX.toFixed(2)} ${targetY.toFixed(2)})`);
    }

    function onMove(clientX: number, clientY: number) {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (r.width === 0) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      // Soft-saturate: pointer ~150 px away already gives full deflection
      // — short reach so the gaze tracks responsively even at small sizes.
      const cap = Math.min(1, dist / 150);
      // Max deflection in SVG units (viewBox is 100×60). The almond clip
      // crops any overshoot so we can push this hard for an obvious
      // "looking at you" feel rather than a subtle twitch.
      const maxX = 12;
      const maxY = 6;
      if (dist > 0) {
        targetX = (dx / dist) * cap * maxX;
        targetY = (dy / dist) * cap * maxY;
      } else {
        targetX = 0;
        targetY = 0;
      }
      if (raf == null) raf = requestAnimationFrame(apply);
    }

    function onPointer(e: PointerEvent) {
      onMove(e.clientX, e.clientY);
    }
    // touchmove for browsers/devices that don't bubble pointermove
    // during drag (mostly older Android webviews).
    function onTouch(e: TouchEvent) {
      const t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY);
    }

    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('touchmove', onTouch);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 60"
      width={size}
      height={(size * 60) / 100}
      role="img"
      aria-label="Sentinel eye"
      className={clsx('animate-amber-pulse', className)}
    >
      <defs>
        <radialGradient id="iris" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#3a2c08" />
          <stop offset="55%" stopColor="#7a5e1a" />
          <stop offset="92%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#5a4310" />
        </radialGradient>
        <radialGradient id="pupil" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#000000" />
          <stop offset="80%" stopColor="#050402" />
          <stop offset="100%" stopColor="#0c0a07" />
        </radialGradient>
        {/* Clip the gaze group to the almond shape so any sub-pixel
            overshoot at extreme angles still gets cropped. */}
        <clipPath id="almondClip">
          <path d="M 4 30 Q 25 8 50 8 Q 75 8 96 30 Q 75 52 50 52 Q 25 52 4 30 Z" />
        </clipPath>
      </defs>

      {/* Almond shell — stationary */}
      <path
        d="M 4 30 Q 25 8 50 8 Q 75 8 96 30 Q 75 52 50 52 Q 25 52 4 30 Z"
        fill="rgba(8,6,3,0.92)"
        stroke="rgba(212,175,55,0.55)"
        strokeWidth="0.8"
      />

      {/* Gaze group — iris + pupil + catchlight move together toward
          the pointer. clip-path keeps them inside the almond. CSS
          transition smooths the rAF setAttribute updates. */}
      <g
        ref={groupRef}
        clipPath="url(#almondClip)"
        style={{ transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <circle cx="50" cy="30" r="14" fill="url(#iris)" />
        <circle cx="50" cy="30" r="5.5" fill="url(#pupil)" />
        <circle cx="47.5" cy="27.5" r="1.1" fill="rgba(255,232,170,0.9)" />
      </g>
    </svg>
  );
}
