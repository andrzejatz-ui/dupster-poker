import { ulid } from 'ulid';
import type {
  Card,
  PlayerAction,
  PlayerActionType,
  Street,
} from '@neon-poker/shared/poker';
import type { LegalActions, PublicSeat, PublicTableState } from '@neon-poker/shared/events';
import { drawCard, makeShuffledDeck } from './deck.js';
import { describeHand, evaluateBest } from './handEvaluator.js';
import { computeSidePots, type PotContribution, type SidePot } from './pot.js';

export type Phase = 'waiting' | Street;

export interface Seat {
  seatIndex: number;
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  stack: number;
  holeCards: [Card, Card] | null;
  currentBet: number;
  totalContributed: number;
  hasFolded: boolean;
  isAllIn: boolean;
  isSittingOut: boolean;
  /** Explicit "I'm taking a break" — set by client:player:pause, excludes
   *  the seat from new hands until the player resumes. */
  isPaused: boolean;
  hasActedThisStreet: boolean;
  isReconnecting: boolean;
}

export interface HandActionRecord {
  seq: number;
  seatIndex: number | null;
  playerId: string | null;
  street: Street;
  action: string;
  amount: number | null;
}

export interface HandResult {
  handId: string;
  handNumber: number;
  board: Card[];
  pot: number;
  sidePots: SidePot[];
  winners: Array<{ seatIndex: number; amount: number; handLabel: string | null }>;
  revealed: Array<{ seatIndex: number; holeCards: [Card, Card]; handLabel: string }>;
  /** seatIndex -> winnings */
  payouts: Map<number, number>;
}

export interface TableConfig {
  tableId: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  maxPlayers: number;
  turnTimerMs: number;
  allowSpectators: boolean;
}

export class PokerTable {
  readonly cfg: TableConfig;
  phase: Phase = 'waiting';
  /**
   * When true, no new hands start automatically and the turn timer is
   * suspended. Set by the admin pause endpoint. Actions on the current
   * hand are still permitted so the in-flight hand can be finished
   * cleanly; only auto-progression is frozen.
   */
  isPaused = false;
  seats: Map<number, Seat> = new Map();
  deck: Card[] = [];
  board: Card[] = [];
  pot = 0;
  currentBet = 0;
  minRaise = 0;
  buttonSeat: number | null = null;
  toActSeat: number | null = null;
  toActDeadline: number | null = null;
  handId: string | null = null;
  handNumber = 0;
  actionLog: HandActionRecord[] = [];
  seenClientActionIds = new Set<string>();
  /** Per-hand last raise size, for min-raise rules. */
  lastRaiseSize = 0;

  constructor(cfg: TableConfig) {
    this.cfg = cfg;
  }

  /* -------- Seating -------- */

  sit(args: {
    seatIndex: number;
    playerId: string;
    displayName: string;
    avatarUrl?: string | null;
    stack: number;
  }): void {
    if (this.seats.has(args.seatIndex)) throw new Error('seat_taken');
    if (args.seatIndex < 0 || args.seatIndex >= this.cfg.maxPlayers)
      throw new Error('bad_seat');
    for (const s of this.seats.values()) {
      if (s.playerId === args.playerId) throw new Error('already_seated');
    }
    this.seats.set(args.seatIndex, {
      seatIndex: args.seatIndex,
      playerId: args.playerId,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl ?? null,
      stack: args.stack,
      holeCards: null,
      currentBet: 0,
      totalContributed: 0,
      hasFolded: false,
      isAllIn: false,
      isSittingOut: this.phase !== 'waiting', // joins mid-hand sit out current
      isPaused: false,
      hasActedThisStreet: false,
      isReconnecting: false,
    });
  }

  /** Returns the seat's remaining stack so the caller can credit it back. */
  leave(seatIndex: number): { stack: number } | null {
    const seat = this.seats.get(seatIndex);
    if (!seat) return null;
    this.seats.delete(seatIndex);
    if (this.phase !== 'waiting') {
      // mid-hand leave is treated as fold; uncalled bets stay in pot
      // (their chips that were committed are lost — that's standard).
    }
    return { stack: seat.stack };
  }

  /* -------- Hand lifecycle -------- */

  /** Returns true if a new hand started, false if not enough players ready. */
  startHand(): boolean {
    const ready = this.activeSeats();
    if (ready.length < 2) return false;

    this.handId = ulid();
    this.handNumber += 1;
    this.actionLog = [];
    this.seenClientActionIds.clear();
    this.deck = makeShuffledDeck();
    this.board = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.cfg.bigBlind;
    this.lastRaiseSize = this.cfg.bigBlind;

    // rotate button — first hand picks lowest seat with active player
    if (this.buttonSeat === null) {
      this.buttonSeat = ready[0]!.seatIndex;
    } else {
      this.buttonSeat = this.nextActiveSeat(this.buttonSeat, ready);
    }

    for (const seat of this.seats.values()) {
      seat.holeCards = null;
      seat.currentBet = 0;
      seat.totalContributed = 0;
      seat.hasFolded = false;
      seat.isAllIn = false;
      seat.hasActedThisStreet = false;
      // sitting-out seats stay out of the hand
      if (!ready.find((r) => r.seatIndex === seat.seatIndex)) {
        seat.isSittingOut = true;
      }
    }
    // unsit anyone who can now play next hand
    for (const seat of ready) seat.isSittingOut = false;

    // deal hole cards: two passes starting left of button
    let dealSeat = this.nextActiveSeat(this.buttonSeat, ready);
    for (let pass = 0; pass < 2; pass++) {
      let cursor = dealSeat;
      for (let i = 0; i < ready.length; i++) {
        const seat = this.seats.get(cursor)!;
        const card = drawCard(this.deck);
        seat.holeCards =
          seat.holeCards === null ? [card, '' as Card] : [seat.holeCards[0], card];
        cursor = this.nextActiveSeat(cursor, ready);
      }
    }

    // post blinds
    const sbSeat = this.nextActiveSeat(this.buttonSeat, ready);
    const bbSeat = this.nextActiveSeat(sbSeat, ready);
    this.postBlind(sbSeat, this.cfg.smallBlind);
    this.postBlind(bbSeat, this.cfg.bigBlind);
    this.currentBet = this.cfg.bigBlind;

    // first to act preflop is UTG (left of BB)
    this.phase = 'preflop';
    this.toActSeat = this.nextActiveSeat(bbSeat, ready);
    this.toActDeadline = Date.now() + this.cfg.turnTimerMs;

    this.log({ seatIndex: null, playerId: null, street: 'preflop', action: 'deal', amount: null });
    return true;
  }

  private postBlind(seatIndex: number, amount: number) {
    const seat = this.seats.get(seatIndex)!;
    const actual = Math.min(amount, seat.stack);
    seat.stack -= actual;
    seat.currentBet = actual;
    seat.totalContributed += actual;
    this.pot += actual;
    if (seat.stack === 0) seat.isAllIn = true;
    this.log({
      seatIndex,
      playerId: seat.playerId,
      street: 'preflop',
      action: 'post_blind',
      amount: actual,
    });
  }

  /* -------- Legal actions -------- */

  legalActionsFor(seatIndex: number): LegalActions | null {
    if (this.toActSeat !== seatIndex) return null;
    const seat = this.seats.get(seatIndex);
    if (!seat || seat.hasFolded || seat.isAllIn) return null;

    const toCall = this.currentBet - seat.currentBet;
    const canCheck = toCall === 0;
    const canCall = toCall > 0 && seat.stack > 0;
    const callAmount = Math.min(toCall, seat.stack);

    const canBet = this.currentBet === 0 && seat.stack > 0;
    const minBet = Math.min(this.cfg.bigBlind, seat.stack);

    const canRaise = this.currentBet > 0 && seat.stack > toCall;
    const minRaise = canRaise
      ? Math.min(seat.stack, toCall + Math.max(this.lastRaiseSize, this.cfg.bigBlind))
      : 0;
    const maxRaise = canRaise ? seat.stack : 0;

    return {
      canCheck,
      canFold: !canCheck, // folding when checking is legal but pointless; UI hides it
      canCall,
      callAmount,
      canBet,
      minBet,
      canRaise,
      minRaise,
      maxRaise,
      canAllIn: seat.stack > 0,
    };
  }

  /* -------- Action application -------- */

  applyAction(
    seatIndex: number,
    action: PlayerAction,
    clientActionId: string,
  ): { ok: true; deduped?: boolean } | { ok: false; code: string; message: string } {
    if (this.seenClientActionIds.has(clientActionId)) {
      return { ok: true, deduped: true };
    }
    if (this.toActSeat !== seatIndex) {
      return { ok: false, code: 'not_your_turn', message: 'Du bist nicht am Zug.' };
    }
    const seat = this.seats.get(seatIndex);
    if (!seat) return { ok: false, code: 'no_seat', message: 'Sitz nicht gefunden.' };
    if (seat.hasFolded || seat.isAllIn) {
      return { ok: false, code: 'cant_act', message: 'Du kannst nicht mehr handeln.' };
    }

    const legal = this.legalActionsFor(seatIndex);
    if (!legal) return { ok: false, code: 'cant_act', message: 'Keine legale Aktion.' };

    const toCall = this.currentBet - seat.currentBet;

    switch (action.type) {
      case 'fold': {
        seat.hasFolded = true;
        seat.hasActedThisStreet = true;
        this.log({ seatIndex, playerId: seat.playerId, street: this.phase as Street, action: 'fold', amount: null });
        break;
      }
      case 'check': {
        if (!legal.canCheck) return { ok: false, code: 'illegal', message: 'Check nicht möglich.' };
        seat.hasActedThisStreet = true;
        this.log({ seatIndex, playerId: seat.playerId, street: this.phase as Street, action: 'check', amount: null });
        break;
      }
      case 'call': {
        if (!legal.canCall) return { ok: false, code: 'illegal', message: 'Call nicht möglich.' };
        this.commit(seat, legal.callAmount);
        seat.hasActedThisStreet = true;
        this.log({ seatIndex, playerId: seat.playerId, street: this.phase as Street, action: 'call', amount: legal.callAmount });
        break;
      }
      case 'bet': {
        if (!legal.canBet) return { ok: false, code: 'illegal', message: 'Bet nicht möglich.' };
        const amt = Math.floor(action.amount);
        if (amt < legal.minBet || amt > seat.stack) {
          return { ok: false, code: 'bad_amount', message: 'Bet außerhalb der erlaubten Grenzen.' };
        }
        this.commit(seat, amt);
        this.currentBet = seat.currentBet;
        this.lastRaiseSize = amt;
        this.resetActedExceptThisSeat(seatIndex);
        seat.hasActedThisStreet = true;
        this.log({ seatIndex, playerId: seat.playerId, street: this.phase as Street, action: 'bet', amount: amt });
        break;
      }
      case 'raise': {
        if (!legal.canRaise) return { ok: false, code: 'illegal', message: 'Raise nicht möglich.' };
        const amt = Math.floor(action.amount);
        if (amt < legal.minRaise || amt > legal.maxRaise) {
          return { ok: false, code: 'bad_amount', message: 'Raise außerhalb der erlaubten Grenzen.' };
        }
        const prevBet = this.currentBet;
        this.commit(seat, amt);
        this.currentBet = seat.currentBet;
        this.lastRaiseSize = this.currentBet - prevBet;
        this.resetActedExceptThisSeat(seatIndex);
        seat.hasActedThisStreet = true;
        this.log({ seatIndex, playerId: seat.playerId, street: this.phase as Street, action: 'raise', amount: amt });
        break;
      }
      case 'all_in': {
        if (seat.stack <= 0) return { ok: false, code: 'illegal', message: 'Stack ist leer.' };
        const amt = seat.stack;
        const prevBet = this.currentBet;
        this.commit(seat, amt);
        // an all-in that exceeds current bet by ≥ min-raise reopens action
        if (seat.currentBet > prevBet) {
          if (seat.currentBet - prevBet >= this.lastRaiseSize) {
            this.lastRaiseSize = seat.currentBet - prevBet;
            this.resetActedExceptThisSeat(seatIndex);
          }
          this.currentBet = seat.currentBet;
        }
        seat.isAllIn = true;
        seat.hasActedThisStreet = true;
        this.log({ seatIndex, playerId: seat.playerId, street: this.phase as Street, action: 'all_in', amount: amt });
        break;
      }
    }

    this.seenClientActionIds.add(clientActionId);
    this.advance();
    return { ok: true };
  }

  /** Server-driven timeout → auto-fold. */
  applyTimeout(seatIndex: number): void {
    const seat = this.seats.get(seatIndex);
    if (!seat || this.toActSeat !== seatIndex) return;
    seat.hasFolded = true;
    seat.hasActedThisStreet = true;
    this.log({
      seatIndex,
      playerId: seat.playerId,
      street: this.phase as Street,
      action: 'fold_timeout',
      amount: null,
    });
    this.advance();
  }

  private commit(seat: Seat, amount: number) {
    const actual = Math.min(amount, seat.stack);
    seat.stack -= actual;
    seat.currentBet += actual;
    seat.totalContributed += actual;
    this.pot += actual;
    if (seat.stack === 0) seat.isAllIn = true;
  }

  private resetActedExceptThisSeat(seatIndex: number) {
    for (const s of this.seats.values()) {
      if (s.seatIndex !== seatIndex && !s.hasFolded && !s.isAllIn) {
        s.hasActedThisStreet = false;
      }
    }
  }

  /* -------- Phase progression -------- */

  /** Advance the to-act pointer or move the street forward. */
  private advance() {
    // Only one player left? Award pot immediately.
    const live = [...this.seats.values()].filter((s) => !s.hasFolded);
    if (live.length === 1) {
      this.finishHandUncalled(live[0]!);
      return;
    }

    // Find next who still has to act this street.
    const next = this.nextToAct();
    if (next !== null) {
      this.toActSeat = next;
      this.toActDeadline = Date.now() + this.cfg.turnTimerMs;
      return;
    }

    // Street complete — move to next.
    this.collectStreetBets();

    if (this.phase === 'preflop') this.dealFlop();
    else if (this.phase === 'flop') this.dealTurn();
    else if (this.phase === 'turn') this.dealRiver();
    else if (this.phase === 'river') this.goToShowdown();
  }

  private nextToAct(): number | null {
    if (this.toActSeat === null) return null;
    const ordered = this.orderedFromSeat(this.toActSeat, /*inclusive*/ false);
    for (const s of ordered) {
      if (s.hasFolded || s.isAllIn) continue;
      const owesCall = s.currentBet < this.currentBet;
      if (!s.hasActedThisStreet || owesCall) return s.seatIndex;
    }
    return null;
  }

  private collectStreetBets() {
    for (const s of this.seats.values()) s.currentBet = 0;
    this.currentBet = 0;
    this.lastRaiseSize = this.cfg.bigBlind;
    for (const s of this.seats.values()) {
      if (!s.hasFolded && !s.isAllIn) s.hasActedThisStreet = false;
    }
  }

  private dealFlop() {
    this.burnAndDeal(3);
    this.phase = 'flop';
    this.beginPostflopBetting();
  }

  private dealTurn() {
    this.burnAndDeal(1);
    this.phase = 'turn';
    this.beginPostflopBetting();
  }

  private dealRiver() {
    this.burnAndDeal(1);
    this.phase = 'river';
    this.beginPostflopBetting();
  }

  private burnAndDeal(n: number) {
    drawCard(this.deck); // burn
    for (let i = 0; i < n; i++) this.board.push(drawCard(this.deck));
  }

  private beginPostflopBetting() {
    if (this.buttonSeat === null) return;
    const ready = this.activeSeats().filter((s) => !s.hasFolded && !s.isAllIn);
    if (ready.length < 2) {
      // everyone all-in or folded — fast-forward to showdown
      if (this.phase === 'flop') return this.dealTurn();
      if (this.phase === 'turn') return this.dealRiver();
      if (this.phase === 'river') return this.goToShowdown();
      return;
    }
    this.toActSeat = this.nextActiveSeat(this.buttonSeat, ready);
    this.toActDeadline = Date.now() + this.cfg.turnTimerMs;
  }

  private goToShowdown() {
    this.phase = 'showdown';
    this.toActSeat = null;
    this.toActDeadline = null;
  }

  /**
   * Only one player still in. Transitions the hand to the showdown
   * phase so the regular finalize-hand pipeline can pay them out via
   * resolveShowdown — DO NOT credit the stack here, otherwise the
   * winner gets paid twice (once here, once in resolveShowdown).
   */
  private finishHandUncalled(winner: Seat) {
    this.log({
      seatIndex: winner.seatIndex,
      playerId: winner.playerId,
      street: 'showdown',
      action: 'win_uncalled',
      amount: null,
    });
    this.phase = 'showdown';
    this.toActSeat = null;
    this.toActDeadline = null;
  }

  /**
   * Compute showdown winners and credit stacks. Must be called when
   * phase==='showdown'. Handles two cases cleanly:
   *
   *  1. Exactly one live seat (everyone else folded) — pay them every
   *     side-pot they're eligible for. No hand evaluation: there may
   *     not even be five cards on the board.
   *  2. Two or more live seats — evaluate each one's best 5-of-7 and
   *     award each side-pot to the highest-ranked eligible live seat.
   */
  resolveShowdown(): HandResult {
    if (this.phase !== 'showdown') throw new Error('not_showdown');
    const handId = this.handId!;
    const handNumber = this.handNumber;
    const board = [...this.board];

    const live = [...this.seats.values()].filter((s) => !s.hasFolded);

    const contributions: PotContribution[] = [...this.seats.values()].map((s) => ({
      seatIndex: s.seatIndex,
      total: s.totalContributed,
      hasFolded: s.hasFolded,
    }));
    const sidePots = computeSidePots(contributions);

    const payouts = new Map<number, number>();
    const winners: HandResult['winners'] = [];
    const revealed: HandResult['revealed'] = [];

    if (live.length <= 1) {
      // Uncalled win — opponent folded, no hand evaluation. The lone
      // live player gets every side pot they qualified for. (Theoretical
      // "live.length === 0" never happens in a regular hand but we
      // tolerate it by simply emitting no payouts.)
      const winner = live[0];
      if (winner) {
        for (const pot of sidePots) {
          if (!pot.eligibleSeatIndexes.includes(winner.seatIndex)) continue;
          winner.stack += pot.amount;
          payouts.set(
            winner.seatIndex,
            (payouts.get(winner.seatIndex) ?? 0) + pot.amount,
          );
        }
        winners.push({
          seatIndex: winner.seatIndex,
          amount: payouts.get(winner.seatIndex) ?? 0,
          handLabel: null,
        });
      }
    } else {
      // Showdown — evaluate every live seat's best 5-of-7.
      const ranks = new Map<
        number,
        { score: number; label: string; cards: [Card, Card] }
      >();
      for (const s of live) {
        const hr = evaluateBest([...board, ...s.holeCards!]);
        ranks.set(s.seatIndex, {
          score: hr.score,
          label: describeHand(hr),
          cards: s.holeCards!,
        });
        revealed.push({
          seatIndex: s.seatIndex,
          holeCards: s.holeCards!,
          handLabel: describeHand(hr),
        });
      }

      for (const pot of sidePots) {
        const eligibleLive = pot.eligibleSeatIndexes.filter((i) => ranks.has(i));
        if (eligibleLive.length === 0) continue;
        const best = Math.max(...eligibleLive.map((i) => ranks.get(i)!.score));
        const winnersHere = eligibleLive.filter((i) => ranks.get(i)!.score === best);
        const share = Math.floor(pot.amount / winnersHere.length);
        const remainder = pot.amount - share * winnersHere.length;
        const sortedWinners = [...winnersHere].sort((a, b) => a - b);
        sortedWinners.forEach((seatIndex, idx) => {
          const amt = share + (idx < remainder ? 1 : 0);
          payouts.set(seatIndex, (payouts.get(seatIndex) ?? 0) + amt);
          const seat = this.seats.get(seatIndex)!;
          seat.stack += amt;
          winners.push({
            seatIndex,
            amount: amt,
            handLabel: ranks.get(seatIndex)!.label,
          });
        });
      }
    }

    this.pot = 0;
    return { handId, handNumber, board, pot: 0, sidePots, winners, revealed, payouts };
  }

  /** End of hand: prepare seats for next; also drops 0-chip players? Caller decides. */
  finishHand(): void {
    this.phase = 'waiting';
    this.handId = null;
    this.toActSeat = null;
    this.toActDeadline = null;
    this.board = [];
    this.deck = [];
    for (const s of this.seats.values()) {
      s.holeCards = null;
      s.currentBet = 0;
      s.totalContributed = 0;
      s.hasFolded = false;
      s.isAllIn = false;
      s.hasActedThisStreet = false;
    }
  }

  /* -------- Helpers -------- */

  activeSeats(): Seat[] {
    return [...this.seats.values()]
      .filter((s) => !s.isSittingOut && !s.isPaused && s.stack > 0)
      .sort((a, b) => a.seatIndex - b.seatIndex);
  }

  /**
   * Mark a seat as paused. If they're currently to-act, auto-fold them
   * out of the running hand so play can move on. The seat stays at the
   * table; they just don't participate until they resume.
   */
  pause(seatIndex: number): { advanced: boolean } {
    const seat = this.seats.get(seatIndex);
    if (!seat) throw new Error('seat_not_found');
    if (seat.isPaused) return { advanced: false };
    seat.isPaused = true;
    if (this.phase !== 'waiting' && !seat.hasFolded) {
      // mid-hand pause = same as fold + sit-out for the rest of the hand
      seat.hasFolded = true;
      seat.hasActedThisStreet = true;
      this.log({
        seatIndex,
        playerId: seat.playerId,
        street: this.phase as Street,
        action: 'fold_paused',
        amount: null,
      });
      if (this.toActSeat === seatIndex) {
        this.advance();
        return { advanced: true };
      }
    }
    return { advanced: false };
  }

  /**
   * Take a paused seat back in. They sit out the current hand if one
   * is running and re-join from the next deal.
   */
  resume(seatIndex: number): void {
    const seat = this.seats.get(seatIndex);
    if (!seat) throw new Error('seat_not_found');
    seat.isPaused = false;
    if (this.phase !== 'waiting') {
      // still wait for the current hand to finish
      seat.isSittingOut = true;
    }
  }

  /** Returns the next seat that's part of the supplied ready list. */
  private nextActiveSeat(after: number, ready: Seat[]): number {
    if (ready.length === 0) throw new Error('no_active_seats');
    const sorted = ready.map((s) => s.seatIndex).sort((a, b) => a - b);
    for (const i of sorted) if (i > after) return i;
    return sorted[0]!;
  }

  /** Iterator of seats starting just after `from`, wrapping, only seated. */
  private *orderedFromSeat(from: number, inclusive: boolean) {
    const sorted = [...this.seats.values()].sort((a, b) => a.seatIndex - b.seatIndex);
    if (sorted.length === 0) return;
    const startIdx = sorted.findIndex((s) => s.seatIndex === from);
    const begin = inclusive ? startIdx : startIdx + 1;
    for (let k = 0; k < sorted.length; k++) {
      yield sorted[(begin + k + sorted.length) % sorted.length]!;
    }
  }

  private log(rec: Omit<HandActionRecord, 'seq'>) {
    this.actionLog.push({ seq: this.actionLog.length + 1, ...rec });
  }

  /* -------- Personalised public view -------- */

  /**
   * True when at least two players are live but no further wagering is
   * possible — i.e. everyone live is all-in, or exactly one live seat
   * still has chips and they've already matched the highest bet. This
   * mirrors the live-poker "cards on their backs" rule and unlocks
   * face-up hole cards for spectators during the run-out.
   */
  private isAllInRunout(): boolean {
    const live = [...this.seats.values()].filter((s) => !s.hasFolded);
    if (live.length < 2) return false;
    const canStillBet = live.filter((s) => !s.isAllIn && s.stack > 0);
    if (canStillBet.length === 0) return true;
    if (canStillBet.length === 1) {
      return canStillBet[0]!.currentBet >= this.currentBet;
    }
    return false;
  }

  publicViewFor(viewerSeat: number | null): PublicTableState {
    const allInRunout = this.isAllInRunout();
    const seats: PublicSeat[] = [...this.seats.values()]
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((s) => {
        const isOwn = viewerSeat !== null && s.seatIndex === viewerSeat;
        const exposeForRunout = allInRunout && !s.hasFolded;
        return {
          seatIndex: s.seatIndex,
          playerId: s.playerId,
          displayName: s.displayName,
          avatarUrl: s.avatarUrl,
          stack: s.stack,
          currentBet: s.currentBet,
          hasFolded: s.hasFolded,
          isAllIn: s.isAllIn,
          isSittingOut: s.isSittingOut,
          isPaused: s.isPaused,
          holeCards:
            (isOwn || exposeForRunout) && s.holeCards
              ? (s.holeCards as [Card, Card])
              : undefined,
          isToAct: this.toActSeat === s.seatIndex,
          isReconnecting: s.isReconnecting,
        };
      });

    const contributions: PotContribution[] = [...this.seats.values()].map((s) => ({
      seatIndex: s.seatIndex,
      total: s.totalContributed,
      hasFolded: s.hasFolded,
    }));
    const sidePots = computeSidePots(contributions);

    const legal =
      viewerSeat !== null ? this.legalActionsFor(viewerSeat) : null;

    return {
      tableId: this.cfg.tableId,
      name: this.cfg.name,
      smallBlind: this.cfg.smallBlind,
      bigBlind: this.cfg.bigBlind,
      buyIn: this.cfg.buyIn,
      maxPlayers: this.cfg.maxPlayers,
      isPaused: this.isPaused,
      phase: this.phase,
      handId: this.handId,
      handNumber: this.handNumber,
      buttonSeat: this.buttonSeat,
      toActSeat: this.toActSeat,
      toActDeadline: this.toActDeadline,
      board: [...this.board],
      pot: this.pot,
      sidePots: sidePots.map((p) => ({
        amount: p.amount,
        eligibleSeatIndexes: p.eligibleSeatIndexes,
      })),
      seats,
      legalActionsForMe: legal,
      mySeatIndex: viewerSeat,
    };
  }
}
