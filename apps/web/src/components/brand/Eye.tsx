'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Sentinel eye that watches the pointer the way a real eye does:
 *
 *  • Iris + pupil track the cursor / finger, but with ease-out
 *    interpolation each frame so motion has the natural ~80–120 ms
 *    latency of a saccade, not the linear lag of a CSS transition.
 *  • The catchlight (specular reflection) stays put — it represents
 *    the room's light source, which doesn't move when the gaze does.
 *    This is the single biggest "looks alive" cue.
 *  • Iris foreshortens slightly when looking far off-axis (perspective
 *    on a curved eyeball), scaled around its own centre so the
 *    boundary never punches through the almond.
 *  • A randomised blink fires every 4–9 s — an opaque lid drops over
 *    the whole almond for ~110 ms and snaps back open.
 *  • A clipPath in the almond shape crops any overshoot so the iris
 *    never leaks past the eye opening regardless of pointer angle.
 *
 * Pointer tracking uses pointermove + a touchmove fallback for older
 * Android webviews. One rAF loop per Eye instance handles all easing.
 */
export function Eye({ size = 32, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const irisGroupRef = useRef<SVGGElement>(null);
  const [blinking, setBlinking] = useState(false);

  // Gaze loop: pointer feeds target, rAF eases current toward target.
  useEffect(() => {
    let raf: number | null = null;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    function tick() {
      raf = requestAnimationFrame(tick);
      // Critically-damped ease-out: each frame closes ~18% of the gap.
      // Gives a 4–5 frame settle ≈ 70–90 ms at 60 fps — natural saccade.
      currentX += (targetX - currentX) * 0.18;
      currentY += (targetY - currentY) * 0.18;
      if (Math.abs(targetX - currentX) < 0.01) currentX = targetX;
      if (Math.abs(targetY - currentY) < 0.01) currentY = targetY;

      const g = irisGroupRef.current;
      if (!g) return;
      // Foreshortening: iris narrows perpendicular to the gaze axis.
      // Capped so the iris is never below 78% of its natural size.
      const sx = Math.max(0.78, 1 - Math.abs(currentX) / 55);
      const sy = Math.max(0.82, 1 - Math.abs(currentY) / 30);
      g.setAttribute(
        'transform',
        `translate(${currentX.toFixed(2)} ${currentY.toFixed(2)})` +
          ` translate(50 30) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-50 -30)`,
      );
    }
    raf = requestAnimationFrame(tick);

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
      // Pointer ~150 px away already gives full deflection.
      const cap = Math.min(1, dist / 150);
      // Max iris travel in SVG units (viewBox is 100×60).
      const maxX = 13;
      const maxY = 6.5;
      if (dist > 0) {
        targetX = (dx / dist) * cap * maxX;
        targetY = (dy / dist) * cap * maxY;
      } else {
        targetX = 0;
        targetY = 0;
      }
    }

    function onPointer(e: PointerEvent) {
      onMove(e.clientX, e.clientY);
    }
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

  // Involuntary blink: ~110 ms closure, randomised every 4–9 s.
  useEffect(() => {
    let openTimer: ReturnType<typeof setTimeout>;
    let cycleTimer: ReturnType<typeof setTimeout>;
    function schedule() {
      const wait = 4000 + Math.random() * 5000;
      cycleTimer = setTimeout(() => {
        setBlinking(true);
        openTimer = setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 110);
      }, wait);
    }
    schedule();
    return () => {
      clearTimeout(openTimer);
      clearTimeout(cycleTimer);
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
        {/* Sclera gradient: very dark, slightly warmer near the lid
            corners so the eye reads as wet/spherical, not flat. */}
        <radialGradient id="sclera" cx="50%" cy="50%" r="65%">
          <stop offset="0%"  stopColor="rgba(36,24,8,0.95)" />
          <stop offset="100%" stopColor="rgba(6,4,2,0.98)" />
        </radialGradient>
        <clipPath id="almondClip">
          <path d="M 4 30 Q 25 8 50 8 Q 75 8 96 30 Q 75 52 50 52 Q 25 52 4 30 Z" />
        </clipPath>
      </defs>

      {/* Almond shell (stays put — the eye opening) */}
      <path
        d="M 4 30 Q 25 8 50 8 Q 75 8 96 30 Q 75 52 50 52 Q 25 52 4 30 Z"
        fill="url(#sclera)"
        stroke="rgba(212,175,55,0.55)"
        strokeWidth="0.8"
      />

      <g clipPath="url(#almondClip)">
        {/* Gaze group — iris, limbal ring, pupil all track the pointer
            and foreshorten together. No catchlight here, see below. */}
        <g ref={irisGroupRef}>
          <circle cx="50" cy="30" r="14" fill="url(#iris)" />
          {/* Limbal ring — the dark outer edge of a real iris. */}
          <circle
            cx="50" cy="30" r="13.6"
            fill="none"
            stroke="rgba(0,0,0,0.55)"
            strokeWidth="0.7"
          />
          <circle cx="50" cy="30" r="5.5" fill="url(#pupil)" />
        </g>

        {/* Catchlight: STATIC. In a real eye the specular highlight is
            a reflection of the room's light source — its screen
            position barely moves when the gaze shifts. Keeping it
            anchored sells the realism more than any other detail. */}
        <circle cx="46.5" cy="26" r="1.3" fill="rgba(255,238,180,0.95)" />
        <circle cx="49.2" cy="28" r="0.6" fill="rgba(255,238,180,0.55)" />

        {/* Eyelid for the blink — only mounts during the ~110 ms blink
            window. Inside the clipPath so it fits the almond exactly. */}
        {blinking && (
          <rect x="0" y="0" width="100" height="60" fill="rgba(6,4,2,0.99)" />
        )}
      </g>
    </svg>
  );
}
