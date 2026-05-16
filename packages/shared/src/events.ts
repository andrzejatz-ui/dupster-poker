import type { Card, PlayerAction, PlayerActionType, Street } from './poker.js';

/* ============================================================
 * Public view-models — exactly what the server is allowed to
 * send to a specific client. Hole cards of other players are
 * NEVER part of any public type.
 * ============================================================ */

export interface PublicSeat {
  seatIndex: number;
  playerId: string;
  displayName: string;
  /** Data-URL of the player's avatar (~128×128 JPEG) or null. */
  avatarUrl?: string | null;
  stack: number;
  currentBet: number;
  hasFolded: boolean;
  isAllIn: boolean;
  isSittingOut: boolean;
  isPaused: boolean;
  /**
   * Eigene Hole Cards — bei fremden Sitzen normalerweise undefined.
   * Ausnahme: All-in-Runout (kein weiterer Einsatz mehr möglich) — dann
   * deckt der Server die Karten aller noch lebenden Sitze auf, analog
   * zur Live-Poker-Regel "Cards on their backs".
   */
  holeCards?: [Card, Card];
  /** Bei Showdown gerevealte Karten anderer Spieler. */
  revealedCards?: [Card, Card];
  isToAct: boolean;
  /** Reconnect-Grace läuft. UI zeigt Spinner. */
  isReconnecting: boolean;
  /** Server-controlled bot seat in an admin-only test room. */
  isBot?: boolean;
}

export interface PublicSidePot {
  amount: number;
  eligibleSeatIndexes: number[];
}

export interface PublicTableState {
  tableId: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  maxPlayers: number;
  isPaused: boolean;
  phase: 'waiting' | Street;
  handId: string | null;
  handNumber: number;
  buttonSeat: number | null;
  toActSeat: number | null;
  /** Epoch ms; UI rendert Countdown daraus. */
  toActDeadline: number | null;
  board: Card[];
  pot: number;
  sidePots: PublicSidePot[];
  seats: PublicSeat[];
  legalActionsForMe: LegalActions | null;
  /** Mein Sitz, falls ich sitze. */
  mySeatIndex: number | null;
  /**
   * Hard cap on a seat's stack at this table. The Top-up flow refuses
   * any amount that would push the stack above this number. Computed
   * as table.buyIn × MAX_BUY_IN_MULTIPLIER (env, default 4×).
   */
  maxBuyIn: number;
  /** Player-initiated top-up is currently legal for my seat. */
  canTopUp: boolean;
}

export interface LegalActions {
  canCheck: boolean;
  canFold: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  minBet: number;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
  canAllIn: boolean;
}

export interface TableSummary {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  seated: number;
  maxPlayers: number;
  inHand: boolean;
}

export interface PendingHello {
  status: 'pending';
}

export interface BannedHello {
  status: 'banned';
  reason: string | null;
}

export interface PendingWalletRequest {
  id: string;
  kind: 'topup' | 'cashout';
  amount: number | null;
  message: string | null;
  createdAt: number;
}

export interface ApprovedHello {
  status: 'approved';
  playerId: string;
  displayName: string;
  chips: number;
  isAdmin: boolean;
  /** The player's currently open wallet request, if any. Lets the
   *  lobby show the "cashout pending" banner immediately on connect
   *  instead of waiting for a separate round-trip. */
  pendingRequest: PendingWalletRequest | null;
}

export type Hello = PendingHello | BannedHello | ApprovedHello;

/* ============================================================
 * Event maps for Socket.IO typing.
 * ============================================================ */

export interface Ack<T> {
  (ack: { ok: true } & T): void;
  (ack: { ok: false; error: string; code?: string }): void;
}

export interface ClientToServerEvents {
  'client:lobby:list': (ack: (res: { tables: TableSummary[] }) => void) => void;
  'client:lobby:join': (
    payload: { tableId: string; seatIndex: number },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'client:table:leave': (
    payload: { tableId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'client:table:action': (
    payload: {
      tableId: string;
      action: PlayerAction;
      clientActionId: string;
    },
    ack: (
      res:
        | { ok: true; deduped?: boolean }
        | { ok: false; error: string; code?: string },
    ) => void,
  ) => void;
  'client:table:chat': (payload: { tableId: string; body: string }) => void;
  /** Player asks to be paused — folded out of the running hand if any
   *  and skipped on every future deal until they resume. */
  'client:player:pause': (
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  'client:player:resume': (
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  /**
   * Pulls chips from the player's off-table wallet into their seat
   * stack. Server is authoritative: validates against the per-table
   * stack cap and wallet balance, refuses while the player is active
   * in the current hand. Ack carries the new stack or an error code.
   */
  'client:player:topup': (
    payload: { amount: number },
    ack: (
      res:
        | { ok: true; newStack: number }
        | { ok: false; error: string; code?: string },
    ) => void,
  ) => void;
  /**
   * Wallet empty — player asks the admin for more chips. The server
   * inserts a row in chip_requests, pings the Telegram admin bot, and
   * the request shows up live in the admin dashboard for approval /
   * rejection. Amount is optional ("I need some chips, you decide");
   * message is optional human context.
   */
  'client:player:chip_request': (
    payload: { amount?: number; message?: string },
    ack: (
      res:
        | { ok: true; requestId: string }
        | { ok: false; error: string; code?: string },
    ) => void,
  ) => void;
  /**
   * Mirror of chip_request, the other direction. Player asks the
   * admin to cash chips out — purely symbolic since the money is
   * fake, but it gives the wallet a real two-way flow. Same DB
   * table (chip_requests, kind='cashout'), same Telegram bot ping,
   * same admin-dashboard approval card. On approve the admin
   * deducts the chips instead of granting them.
   */
  'client:player:cashout_request': (
    payload: { amount?: number; message?: string },
    ack: (
      res:
        | { ok: true; requestId: string }
        | { ok: false; error: string; code?: string },
    ) => void,
  ) => void;
  /**
   * Player cancels their own pending wallet request. For a cashout the
   * held chips are refunded to the wallet; for a topup the row is
   * simply marked cancelled. Either way the request leaves the admin's
   * pending queue.
   */
  'client:player:wallet_request_cancel': (
    ack: (
      res:
        | { ok: true }
        | { ok: false; error: string; code?: string },
    ) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'server:hello': (hello: Hello) => void;
  'server:lobby:tables': (payload: { tables: TableSummary[] }) => void;
  'server:table:state': (payload: PublicTableState) => void;
  'server:table:hand:start': (payload: {
    tableId: string;
    handId: string;
    handNumber: number;
    buttonSeat: number;
    smallBlind: number;
    bigBlind: number;
  }) => void;
  'server:table:deal': (payload: {
    tableId: string;
    phase: Street;
    board?: Card[];
  }) => void;
  'server:table:turn': (payload: {
    tableId: string;
    seatIndex: number;
    deadline: number;
    legalActions: LegalActions;
  }) => void;
  'server:table:action': (payload: {
    tableId: string;
    seatIndex: number;
    action: PlayerActionType;
    amount: number;
    potAfter: number;
  }) => void;
  'server:table:hand:result': (payload: {
    tableId: string;
    handId: string;
    sidePots: PublicSidePot[];
    winners: Array<{
      seatIndex: number;
      amount: number;
      handLabel: string | null;
    }>;
    revealed: Array<{
      seatIndex: number;
      holeCards: [Card, Card];
      handLabel: string;
      /** The 5 cards (hole + board) that scored the seat's hand. */
      bestCards: Card[];
    }>;
    board: Card[];
  }) => void;
  'server:table:chat': (payload: {
    tableId: string;
    seatIndex: number | null;
    from: string;
    body: string;
    at: number;
  }) => void;
  'server:table:error': (payload: { code: string; message: string }) => void;
  'server:account:approved': (payload: { chips: number }) => void;
  'server:account:banned': (payload: { reason: string | null }) => void;
  'server:account:chip_update': (payload: {
    chips: number;
    delta: number;
    reason: string;
  }) => void;
  'server:account:session_revoked': (payload: { reason: string }) => void;
  /**
   * Tells the player to leave a table view they're currently on — they
   * were kicked by an admin or the table was closed. UI should redirect
   * to /lobby and surface the reason as a toast/alert.
   */
  'server:account:left_table': (payload: {
    tableId: string;
    reason: 'kicked' | 'table_closed';
  }) => void;
  /**
   * Player's pending wallet request changed state — either a fresh
   * request was just created (request: not null) or the request was
   * resolved / cancelled (request: null). The lobby uses this to
   * render or hide the "cashout pending" banner live, without
   * polling.
   */
  'server:account:wallet_request_update': (payload: {
    request: PendingWalletRequest | null;
  }) => void;
}

export interface SocketData {
  sessionId: string;
  playerId: string;
  isAdmin: boolean;
}
