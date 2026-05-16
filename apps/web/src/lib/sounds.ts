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
 * Soft warm major-third arpeggio for hand-result. Three sine notes
 * (C5–E5–G5) staggered by ~100 ms, each with a gentle 250 ms decay
 * envelope. Together they form a warm, classy "win" chord that
 * doesn't feel like a slot machine. Total energy is well under the
 * old triangle-wave plink so neither player feels nagged.
 *
 * Old name kept as alias so existing imports don't break.
 */
export function playWinChord(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  // C major arpeggio — warm + resolved + universally pleasant.
  const notes: Array<{ freq: number; start: number }> = [
    { freq: 523.25, start: 0 },     // C5
    { freq: 659.25, start: 0.090 }, // E5
    { freq: 783.99, start: 0.180 }, // G5
  ];

  for (const n of notes) {
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = n.freq;

    // A subtle 2-cent detune sibling for body. Disabled if too heavy.
    const detune = audio.createOscillator();
    detune.type = 'sine';
    detune.frequency.value = n.freq * 1.002;

    const gain = audio.createGain();
    const startAt = now + n.start;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42);

    const detuneGain = audio.createGain();
    detuneGain.gain.value = 0.4;

    osc.connect(gain).connect(audio.destination);
    detune.connect(detuneGain).connect(gain);
    osc.start(startAt);
    detune.start(startAt);
    osc.stop(startAt + 0.46);
    detune.stop(startAt + 0.46);
  }
}

/** @deprecated old triangle-wave plink — alias kept for back-compat. */
export const playChipPlink = playWinChord;

/**
 * "Cha-ching" cash-register feel for the player who just won the pot.
 * A bright bell on top of a quick coin-clatter noise burst, finished
 * by the warm major-third arpeggio so the moment lands and resolves.
 * Total length ~900 ms, kept under the win-chord peak so it doesn't
 * blow the user's ears off.
 */
export function playCashRegister(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  // 1) Bright bell — sine + slight detune for shimmer.
  const bell = audio.createOscillator();
  bell.type = 'sine';
  bell.frequency.setValueAtTime(1760, now); // A6
  bell.frequency.exponentialRampToValueAtTime(880, now + 0.18);
  const bellGain = audio.createGain();
  bellGain.gain.setValueAtTime(0.0001, now);
  bellGain.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
  bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
  bell.connect(bellGain).connect(audio.destination);
  bell.start(now);
  bell.stop(now + 0.32);

  // 2) Coin-clatter — high-frequency band-passed noise burst right
  //    after the bell, then a softer second burst for "more coins".
  for (const offset of [0.08, 0.20]) {
    const noise = audio.createBufferSource();
    const len = Math.floor(0.20 * audio.sampleRate);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    noise.buffer = buf;
    const filt = audio.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 2200;
    filt.Q.value = 0.6;
    const ng = audio.createGain();
    const start = now + offset;
    ng.gain.setValueAtTime(0.0001, start);
    ng.gain.exponentialRampToValueAtTime(0.06, start + 0.012);
    ng.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    noise.connect(filt).connect(ng).connect(audio.destination);
    noise.start(start);
    noise.stop(start + 0.22);
  }

  // 3) Resolving major chord, slightly delayed so the bell + clatter
  //    register first. Reuses the same envelope as playWinChord but
  //    inline so we control the start offset precisely.
  const chordStart = now + 0.32;
  const notes: Array<{ freq: number; start: number }> = [
    { freq: 523.25, start: 0 },     // C5
    { freq: 659.25, start: 0.090 }, // E5
    { freq: 783.99, start: 0.180 }, // G5
  ];
  for (const n of notes) {
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    const g = audio.createGain();
    const t0 = chordStart + n.start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    osc.connect(g).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.46);
  }
}

/**
 * Descending three-note motif for the player who lost the showdown.
 * Classic "game over" feel — a minor third descent on a slightly
 * detuned triangle wave that bends down on the last note for the
 * cartoonish drop. Quieter than the win chord so the room cheering
 * the winner stays the dominant cue.
 */
export function playGameOver(): void {
  if (isMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;

  // Descending: G4 → E4 → C4, last note bends a semitone down.
  const notes: Array<{ freq: number; bendTo?: number; start: number; dur: number }> = [
    { freq: 392.00, start: 0,    dur: 0.22 }, // G4
    { freq: 329.63, start: 0.20, dur: 0.22 }, // E4
    { freq: 261.63, start: 0.42, dur: 0.55, bendTo: 207.65 }, // C4 → G#3 droop
  ];
  for (const n of notes) {
    const osc = audio.createOscillator();
    osc.type = 'triangle';
    const t0 = now + n.start;
    osc.frequency.setValueAtTime(n.freq, t0);
    if (n.bendTo) {
      osc.frequency.exponentialRampToValueAtTime(n.bendTo, t0 + n.dur);
    }
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.05);
  }
}
