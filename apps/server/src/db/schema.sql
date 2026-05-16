-- ============================================================
-- Neon Poker — Postgres schema
-- Apply once:   psql "$DATABASE_URL" -f apps/server/src/db/schema.sql
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists admins (
  id              uuid primary key default gen_random_uuid(),
  username        text unique not null,
  password_hash   text not null,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create table if not exists players (
  id                        uuid primary key default gen_random_uuid(),
  player_handle             text unique not null,
  display_name              text,
  -- Players choose their own password on /join. Stored in PLAINTEXT so the
  -- admin can read it back from the dashboard and resend it if a player
  -- forgets. This is a deliberate trust trade-off in a private play-money
  -- context; passwords here MUST NOT be reused from other services.
  password                  text,
  status                    text not null default 'pending'
                            check (status in ('pending','approved','banned')),
  chips                     bigint not null default 0 check (chips >= 0),
  allow_concurrent_sessions boolean not null default false,
  created_at                timestamptz not null default now(),
  approved_at               timestamptz,
  approved_by               uuid references admins(id),
  banned_at                 timestamptz,
  banned_reason             text
);
-- For existing installs:
alter table players add column if not exists password text;
create index if not exists players_status_idx on players(status);

create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  token_hash    text not null,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists sessions_player_idx
  on sessions(player_id) where revoked_at is null;

create table if not exists tables (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  small_blind      bigint not null check (small_blind > 0),
  big_blind        bigint not null check (big_blind > small_blind),
  buy_in           bigint not null,
  max_players      int not null check (max_players between 2 and 10),
  allow_spectators boolean not null default false,
  -- Admin-only sandbox tables seated with bots. Archived on every
  -- server restart since their in-memory bots can't survive a reboot.
  is_test_room     boolean not null default false,
  created_at       timestamptz not null default now(),
  created_by       uuid not null references admins(id),
  archived_at      timestamptz
);

create table if not exists table_seats (
  table_id    uuid not null references tables(id) on delete cascade,
  seat_index  int not null check (seat_index between 0 and 9),
  player_id   uuid not null references players(id),
  stack       bigint not null check (stack >= 0),
  sat_down_at timestamptz not null default now(),
  primary key (table_id, seat_index)
);
create unique index if not exists table_seats_unique_player
  on table_seats(player_id);

create table if not exists hands (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references tables(id),
  hand_number bigint not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  board       text[],
  pot_total   bigint,
  unique (table_id, hand_number)
);

create table if not exists chip_ledger (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id),
  delta          bigint not null,
  balance_after  bigint not null,
  reason         text not null
                 check (reason in
                   ('admin_grant','admin_revoke','admin_set',
                    'buy_in','cash_out','win','lose')),
  ref_table_id   uuid references tables(id),
  ref_hand_id    uuid references hands(id),
  admin_id       uuid references admins(id),
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists chip_ledger_player_idx
  on chip_ledger(player_id, created_at desc);

create table if not exists hand_actions (
  id         bigserial primary key,
  hand_id    uuid not null references hands(id) on delete cascade,
  seq        int not null,
  player_id  uuid references players(id),
  street     text not null check (street in
              ('preflop','flop','turn','river','showdown')),
  action     text not null,
  amount     bigint,
  created_at timestamptz not null default now(),
  unique (hand_id, seq)
);

create table if not exists hand_results (
  hand_id      uuid not null references hands(id) on delete cascade,
  player_id    uuid not null references players(id),
  hole_cards   text[] not null,
  best_hand    text,
  winnings     bigint not null,
  showed_down  boolean not null default false,
  primary key (hand_id, player_id)
);

create table if not exists chat_messages (
  id         bigserial primary key,
  table_id   uuid not null references tables(id) on delete cascade,
  player_id  uuid not null references players(id),
  body       text not null check (length(body) <= 280),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_table_idx
  on chat_messages(table_id, created_at desc);

create table if not exists admin_log (
  id                bigserial primary key,
  admin_id          uuid not null references admins(id),
  action            text not null,
  target_player_id  uuid references players(id),
  target_table_id   uuid references tables(id),
  payload           jsonb,
  reason            text,
  created_at        timestamptz not null default now()
);
create index if not exists admin_log_created_idx on admin_log(created_at desc);
