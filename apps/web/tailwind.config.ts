import type { Config } from 'tailwindcss';

/**
 * Obsidian + antique-gold design system.
 *
 * Strict monochrome shell with a single warm accent (#d4af37). No purple,
 * blue, neon or extra hues elsewhere — keeps the secret-society mood.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#09090b',
          soft: '#0c0c0f',
          surface: '#0e0e12',
          hover: 'rgba(20, 20, 26, 0.9)',
        },
        gold: {
          DEFAULT: '#d4af37',
          dim: '#b8962e',
          deep: '#2a2005',
          glow: 'rgba(212, 175, 55, 0.12)',
        },
        ink: {
          primary: '#e4e4e7',
          secondary: '#a1a1aa',
          muted: '#52525b',
        },
        status: {
          success: '#27ae60',
          warning: '#e0a800',
          alert: '#c0392b',
        },
        rim: {
          faint: 'rgba(212, 175, 55, 0.08)',
          bright: 'rgba(212, 175, 55, 0.18)',
          cool: 'rgba(255, 255, 255, 0.04)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'gold-soft':
          '0 0 0 1px rgba(212,175,55,0.18) inset, 0 0 22px -8px rgba(212,175,55,0.30)',
        'gold-strong':
          '0 0 0 1px rgba(212,175,55,0.35) inset, 0 0 32px -6px rgba(212,175,55,0.55)',
        sigil:
          '0 30px 90px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,175,55,0.10) inset',
      },
      backgroundImage: {
        'obsidian-radial':
          'radial-gradient(ellipse at 18% 12%, rgba(212,175,55,0.06), transparent 38%),' +
          'radial-gradient(ellipse at 82% 80%, rgba(212,175,55,0.04), transparent 50%),' +
          'linear-gradient(180deg, #09090b 0%, #0c0c0f 100%)',
        'felt-obsidian':
          'radial-gradient(ellipse at center, #14110a 0%, #0c0a07 55%, #050402 95%)',
      },
      animation: {
        'amber-pulse': 'amberPulse 6s ease-in-out infinite',
        'card-flip': 'cardFlip 0.6s ease-out',
        'chip-pop': 'chipPop 0.35s ease-out',
        'grain-jitter': 'grainJitter 0.6s steps(2) infinite',
      },
      keyframes: {
        amberPulse: {
          '0%, 100%': { filter: 'drop-shadow(0 0 14px rgba(212,175,55,0.18))' },
          '50%': { filter: 'drop-shadow(0 0 22px rgba(212,175,55,0.32))' },
        },
        cardFlip: {
          '0%': { transform: 'rotateY(180deg)', opacity: '0' },
          '60%': { opacity: '1' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        chipPop: {
          '0%': { transform: 'translateY(-8px) scale(0.7)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        grainJitter: {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(-2px, 1px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
