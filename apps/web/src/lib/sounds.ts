'use client';

/**
 * Tiny Web Audio synth — no external audio asset, no autoplay blocker
 * issues as long as it fires after a user gesture (which it always
 * does in our app: first sound is on hand-deal AFTER the player sat).
 *
 * Keeps a single AudioContext per page so we don't spawn one per call.
 */

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const C = W.AudioContext ?? W.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  // Some browsers suspend the context until the next user gesture.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('np_muted', m ? '1' : '0');
    }
  } catch {/* ignore */}
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return muted;
  try {
    const v = window.localStorage.getItem('np_muted');
    if (v !== null) muted = v === '1';
  } catch {/* ignore */}
  return muted;
}

/**
 * Short "card swoosh" — a band-passed noise burst with a quick decay.
 * Soft, low-frequency, doesn't fight with voice or chat.
 */
export function playDealCard(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  const noise = audio.createBufferSource();
  const len = Math.floor(0.18 * audio.sampleRate);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // pink-ish noise, gently shaped
    data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.7;
  }
  noise.buffer = buf;

  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2400, now);
  filter.frequency.exponentialRampToValueAtTime(700, now + 0.18);
  filter.Q.value = 1.4;

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

  noise.connect(filter).connect(gain).connect(audio.destination);
  noise.start(now);
  noise.stop(now + 0.22);
}

/**
 * Quiet chat ding — small high-end blip, well under the deal swoosh
 * level so it never overwhelms the table.
 */
export function playChatDing(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  const osc = audio.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1320, now);
  osc.frequency.exponentialRampToValueAtTime(940, now + 0.12);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

/**
 * Soft warm chip-stack thunk — for a winning hand or major event.
 */
export function playChipPlink(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  const osc = audio.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(560, now + 0.18);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}
