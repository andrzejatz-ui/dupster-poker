import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05070d',
          900: '#0a0d18',
          800: '#101524',
          700: '#1a2236',
          600: '#2a3552',
        },
        neon: {
          blue: '#3aa6ff',
          cyan: '#3df0e3',
          violet: '#b475ff',
          pink: '#ff5fce',
          green: '#3ef0a0',
          gold: '#ffd166',
        },
        felt: {
          DEFAULT: '#0c1e1c',
          dark: '#061110',
          light: '#11302d',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        'neon-blue': '0 0 24px 0 rgba(58,166,255,0.45), 0 0 4px 0 rgba(58,166,255,0.8) inset',
        'neon-cyan': '0 0 24px 0 rgba(61,240,227,0.45), 0 0 4px 0 rgba(61,240,227,0.8) inset',
        'neon-violet': '0 0 28px 0 rgba(180,117,255,0.5), 0 0 4px 0 rgba(180,117,255,0.8) inset',
        'glass-lg': '0 30px 90px -30px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06) inset',
      },
      backgroundImage: {
        'grid-faint':
          'radial-gradient(circle at 25% 30%, rgba(58,166,255,0.18), transparent 45%),' +
          'radial-gradient(circle at 75% 70%, rgba(180,117,255,0.18), transparent 50%),' +
          'linear-gradient(180deg, #05070d 0%, #0a0d18 100%)',
        'felt-radial':
          'radial-gradient(ellipse at center, #1a4944 0%, #0c1e1c 45%, #03100f 90%)',
      },
      animation: {
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        'card-flip': 'cardFlip 0.6s ease-out',
        'chip-pop': 'chipPop 0.35s ease-out',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.65' },
          '50%': { opacity: '1' },
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
      },
    },
  },
  plugins: [],
};

export default config;
