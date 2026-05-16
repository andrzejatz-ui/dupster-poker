'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';

interface Props {
  size?: number;
  className?: string;
  /**
   * Optional image to use as the iris. When set, the almond renders
   * the picture instead of the gold iris and shifts a few SVG units
   * with the pointer. When omitted (the default everywhere now), the
   * eye renders its original gold-iris + dark-pupil sentinel look —
   * which is what the brand intends.
   */
  imageUrl?: string | null;
}

/**
 * PULSE-style sentinel eye — mirrors the eye in the Zendesk analyse app.
 *
 * When no image is supplied: iris sits still, only the pupil + specular
 * highlight track the pointer. Original behaviour.
 *
 * When an image (player avatar / brand logo) is supplied: the image is
 * placed inside the almond eye-clip and *the whole image* shifts a few
 * SVG units in the cursor's direction — no separate pupil. This keeps
 * the "alive, following your finger" feel while making the eye uniquely
 * the player's identity, exactly like the asked-for "mein Profillogo
 * als Auge" feature.
 *
 * Motion is eased per frame (lerp 0.18) so saccades land in 70–90 ms
 * — fast enough to feel reactive, soft enough to feel alive. When the
 * pointer leaves the window the iris/image snaps back to centre.
 */
export function Eye({ size = 32, className, imageUrl }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilRef = useRef<SVGCircleElement>(null);
  const highlightRef = useRef<SVGCircleElement>(null);
  const imageRef = useRef<SVGImageElement>(null);

  // Caller-supplied image wins; otherwise stay on the gold iris look.
  // (Earlier versions auto-pulled the player's avatar from session
  // storage — reverted because the brand Eye is meant to be an eye,
  // not a portrait window.)
  const resolvedImg = imageUrl ?? null;

  useEffect(() => {
    const CX = 50;
    const CY = 30;
    // Pupil mode tracks farther; image mode shifts less so the image
    // never clips its corners outside the almond.
    const MAX_OFFSET = resolvedImg ? 4 : 9;
    let raf: number | null = null;
    let targetX = CX;
    let targetY = CY;
    let actualX = CX;
    let actualY = CY;

    function tick() {
      raf = requestAnimationFrame(tick);
      actualX += (targetX - actualX) * 0.18;
      actualY += (targetY - actualY) * 0.18;
      if (resolvedImg) {
        // The image is 80×48 centred on (10, 6) when actualX=50, actualY=30.
        // Translate via x/y offset attributes.
        const img = imageRef.current;
        if (img) {
          img.setAttribute('x', (10 + (actualX - CX)).toFixed(2));
          img.setAttribute('y', (6 + (actualY - CY)).toFixed(2));
        }
      } else {
        const p = pupilRef.current;
        const h = highlightRef.current;
        if (p) {
          p.setAttribute('cx', actualX.toFixed(2));
          p.setAttribute('cy', actualY.toFixed(2));
        }
        if (h) {
          h.setAttribute('cx', (actualX - 1.8).toFixed(2));
          h.setAttribute('cy', (actualY - 1.8).toFixed(2));
        }
      }
    }
    raf = requestAnimationFrame(tick);

    function onMove(clientX: number, clientY: number) {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (r.width === 0) return;
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const dx = clientX - ex;
      const dy = clientY - ey;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) {
        targetX = CX;
        targetY = CY;
        return;
      }
      const ratio = Math.min(1, dist / 260);
      const offset = MAX_OFFSET * ratio;
      targetX = CX + (dx / dist) * offset;
      targetY = CY + (dy / dist) * offset;
    }

    function onPointer(e: PointerEvent) {
      onMove(e.clientX, e.clientY);
    }
    function onTouch(e: TouchEvent) {
      const t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY);
    }
    function onLeave() {
      targetX = CX;
      targetY = CY;
    }

    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('pointerleave', onLeave);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [resolvedImg]);

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
        <radialGradient id="iris-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"  stopColor="#3a2c08" />
          <stop offset="55%" stopColor="#7a5e1a" />
          <stop offset="85%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#5a4310" />
        </radialGradient>
        <radialGradient id="pupil-grad" cx="0.4" cy="0.4" r="0.6">
          <stop offset="0%"  stopColor="#1a1208" />
          <stop offset="80%" stopColor="#000000" />
        </radialGradient>
        <filter id="eye-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="eye-clip">
          <path d="M 4 30 Q 50 -4 96 30 Q 50 64 4 30 Z" />
        </clipPath>
      </defs>

      {/* Almond shell — wider curves than the original Egyptian sketch so
          the pupil/iris fill the opening properly. */}
      <path
        d="M 4 30 Q 50 -4 96 30 Q 50 64 4 30 Z"
        fill="rgba(8,6,3,0.92)"
        stroke="rgba(212,175,55,0.55)"
        strokeWidth="0.7"
      />

      <g clipPath="url(#eye-clip)" filter="url(#eye-glow)">
        {resolvedImg ? (
          // Image-as-eye mode. preserveAspectRatio="xMidYMid slice" so the
          // user's picture fills the almond without distortion, then the
          // tick loop nudges x/y a few units to track the pointer.
          <image
            ref={imageRef}
            href={resolvedImg}
            x="10"
            y="6"
            width="80"
            height="48"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <>
            {/* Iris — stays put. */}
            <circle cx="50" cy="30" r="16" fill="url(#iris-grad)" />
            {/* Pupil — JS sets cx/cy each frame. */}
            <circle ref={pupilRef} cx="50" cy="30" r="7" fill="url(#pupil-grad)" />
            {/* Specular highlight — glued to pupil at (-1.8, -1.8). */}
            <circle ref={highlightRef} cx="48.2" cy="28.2" r="1.6" fill="rgba(255,232,170,0.9)" />
          </>
        )}
      </g>

      {/* Subtle gold lid arc — adds depth without obscuring the iris. */}
      <path
        d="M 6 31 Q 50 0 94 31"
        fill="none"
        stroke="rgba(212,175,55,0.18)"
        strokeWidth="0.5"
      />
    </svg>
  );
}
