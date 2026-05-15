import { describe, expect, it } from 'vitest';
import type { Card } from '@neon-poker/shared/poker';
import { evaluateBest, evaluateFive } from './handEvaluator.js';

function c(s: string): Card[] {
  return s.split(' ') as Card[];
}

describe('handEvaluator', () => {
  it('detects royal flush', () => {
    const r = evaluateFive(c('Ah Kh Qh Jh Th'));
    expect(r.category).toBe('straight_flush');
    expect(r.kickers[0]).toBe('A');
  });

  it('wheel straight is 5-high', () => {
    const r = evaluateFive(c('Ah 2d 3s 4c 5h'));
    expect(r.category).toBe('straight');
    expect(r.kickers[0]).toBe('5');
  });

  it('full house beats flush', () => {
    const flush = evaluateFive(c('Ah Kh 9h 6h 2h'));
    const fh = evaluateFive(c('Ks Kd Kh 4c 4s'));
    expect(fh.score).toBeGreaterThan(flush.score);
  });

  it('two pair tiebreaker uses high pair', () => {
    const aces99 = evaluateFive(c('As Ad 9h 9c 5s'));
    const kk88 = evaluateFive(c('Ks Kd 8h 8c 4s'));
    expect(aces99.score).toBeGreaterThan(kk88.score);
  });

  it('evaluateBest picks best 5 of 7', () => {
    // Hole As Ks, board Qs Js Ts 2c 7d → royal flush
    const r = evaluateBest(c('As Ks Qs Js Ts 2c 7d'));
    expect(r.category).toBe('straight_flush');
    expect(r.kickers[0]).toBe('A');
  });

  it('kicker decides between equal pairs', () => {
    const aaK = evaluateFive(c('As Ad 9h 7c Kc'));
    const aaQ = evaluateFive(c('As Ah 9h 7c Qc'));
    expect(aaK.score).toBeGreaterThan(aaQ.score);
  });
});
