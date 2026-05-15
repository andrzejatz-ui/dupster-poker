# Datenmodelle

PostgreSQL-Schema. Spielzustand-RAM ist getrennt davon (siehe ARCHITECTURE).
Persistiert wird nur, was nach Restart noch existieren muss: Spieler, Chips,
Tische, Hand-Logs, Audit-Logs.

```sql
-- Spieler-Stammdaten
create table players (
  id                      uuid primary key default gen_random_uuid(),
  player_handle           text unique not null,  -- die manuell eingegebene Player-ID
  display_name            text,
  status                  text not null default 'pending'
                          check (status in ('pending','approved','banned')),
  chips                   bigint not null default 0 check (chips >= 0),
  allow_concurrent_sessions boolean not null default false,
  created_at              timestamptz not null default now(),
  approved_at             timestamptz,
  approved_by             uuid references admins(id),
  banned_at               timestamptz,
  banned_reason           text
);
create index on players(status);

-- Admin-Accounts (separat von players)
create table admins (
  id              uuid primary key default gen_random_uuid(),
  username        text unique not null,
  password_hash   text not null,             -- argon2id
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

-- Aktive Sessions (RAM + DB für Reconnect über Restart)
create table sessions (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  token_hash    text not null,             -- sha256 des Tokens
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);
create index on sessions(player_id) where revoked_at is null;

-- Tische
create table tables (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  small_blind      bigint not null check (small_blind > 0),
  big_blind        bigint not null check (big_blind > small_blind),
  buy_in           bigint not null check (buy_in >= big_blind * 20),
  max_players      int not null check (max_players between 2 and 9),
  allow_spectators boolean not null default false,
  created_at       timestamptz not null default now(),
  created_by       uuid not null references admins(id),
  archived_at      timestamptz
);

-- Sitze (wer sitzt grad wo, RAM-spiegelung)
create table table_seats (
  table_id    uuid not null references tables(id) on delete cascade,
  seat_index  int not null check (seat_index between 0 and 8),
  player_id   uuid not null references players(id),
  stack       bigint not null check (stack >= 0),
  sat_down_at timestamptz not null default now(),
  primary key (table_id, seat_index)
);
create unique index on table_seats(player_id);  -- ein Spieler pro Zeitpunkt an einem Tisch

-- Chip-Ledger (jede Bewegung)
create table chip_ledger (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id),
  delta       bigint not null,                -- + oder -
  balance_after bigint not null,
  reason      text not null
              check (reason in
                ('admin_grant','admin_revoke','admin_set',
                 'buy_in','cash_out','win','lose')),
  ref_table_id uuid references tables(id),
  ref_hand_id  uuid references hands(id),
  admin_id    uuid references admins(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index on chip_ledger(player_id, created_at desc);

-- Hände (eine Zeile pro gespielte Hand)
create table hands (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references tables(id),
  hand_number bigint not null,                -- inkrementell pro Tisch
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  board       text[],                         -- ['Ah','Kd','7c','2s','9h']
  pot_total   bigint,
  unique (table_id, hand_number)
);

-- Aktionen einer Hand (für Audit, Replay)
create table hand_actions (
  id         bigserial primary key,
  hand_id    uuid not null references hands(id) on delete cascade,
  seq        int not null,
  player_id  uuid references players(id),     -- null bei System-Events
  street     text not null check (street in ('preflop','flop','turn','river','showdown')),
  action     text not null,                   -- check, bet, call, raise, fold, all_in, post_blind, deal
  amount     bigint,
  created_at timestamptz not null default now(),
  unique (hand_id, seq)
);

-- Ergebnisse pro Spieler in einer Hand
create table hand_results (
  hand_id      uuid not null references hands(id) on delete cascade,
  player_id    uuid not null references players(id),
  hole_cards   text[] not null,    -- ['As','Kh']
  best_hand    text,               -- 'flush', 'two_pair', etc.
  winnings     bigint not null,    -- + oder 0
  showed_down  boolean not null default false,
  primary key (hand_id, player_id)
);

-- Chat
create table chat_messages (
  id         bigserial primary key,
  table_id   uuid not null references tables(id) on delete cascade,
  player_id  uuid not null references players(id),
  body       text not null check (length(body) <= 280),
  created_at timestamptz not null default now()
);
create index on chat_messages(table_id, created_at desc);

-- Admin-Audit
create table admin_log (
  id         bigserial primary key,
  admin_id   uuid not null references admins(id),
  action     text not null,        -- 'approve_player','ban_player','grant_chips', ...
  target_player_id uuid references players(id),
  target_table_id  uuid references tables(id),
  payload    jsonb,
  reason     text,
  created_at timestamptz not null default now()
);
create index on admin_log(created_at desc);
```

## Invariants

- `players.chips ≥ 0` immer. Negative Bewegung muss in TX gegen aktuellen
  Stand geprüft werden.
- Pro `player_id` höchstens **ein** Eintrag in `table_seats` (unique index).
- Buy-in ≥ 20×BB (Standard-Poker-Regel, im Check enforced).
- `chip_ledger.balance_after` muss in derselben TX wie der Player-Update
  geschrieben werden, damit Auditing nie ein Drift zeigt.

## RAM-Repräsentation (nicht in DB)

Der Server hält pro aktivem Tisch ein `TableState`-Objekt im Memory mit:

```ts
{
  tableId, phase: 'waiting'|'preflop'|'flop'|'turn'|'river'|'showdown',
  deck: Card[],         // ungespielte Karten, NIE seriealisiert
  board: Card[],
  pot: number,
  sidePots: SidePot[],
  seats: Seat[],        // mit holeCards, currentBet, hasFolded, ...
  buttonSeat: number,
  toActSeat: number,
  toActDeadline: number, // epoch ms
  handId: string | null,
  handNumber: number,
  actionLog: HandAction[],
}
```

Bei Crash: laufende Hand wird abgebrochen, Stacks wie zuletzt geschrieben
wiederhergestellt (worst case verlieren Spieler ihre `currentBet` des aktiven
Tisches — daher persistiert Stack-Updates **vor** jeder Action-Annahme).
