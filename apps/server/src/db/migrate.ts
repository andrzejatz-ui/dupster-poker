import { pool } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotent on-boot migrations. Every statement uses `if not exists`,
 * `if exists` or an equivalent guard so it's safe to run on every boot.
 * Once a deploy applies them, subsequent boots are no-ops.
 *
 * Add new migrations to the bottom; do not rewrite past entries.
 */
export async function runMigrations(): Promise<void> {
  const steps: Array<{ name: string; sql: string }> = [
    {
      name: 'players.password column',
      sql: 'alter table players add column if not exists password text',
    },
    {
      name: 'players.avatar_url column',
      sql: 'alter table players add column if not exists avatar_url text',
    },
    {
      name: 'players.deleted_at column (soft-delete)',
      sql: 'alter table players add column if not exists deleted_at timestamptz',
    },
    {
      name: 'players.last_login_at column',
      sql: 'alter table players add column if not exists last_login_at timestamptz',
    },
    {
      name: 'admins.play_handle column',
      sql: 'alter table admins add column if not exists play_handle text',
    },
    {
      name: 'admins.play_chips column',
      sql: 'alter table admins add column if not exists play_chips bigint default 10000',
    },
    {
      // The first-generation default tables and any manually-created
      // "Neon Table" / "Dupster Table" entries are replaced by the new
      // escalating natural-disaster tier (Breeze → Tsunami). Archive
      // them so the next ensureDefaultTables() pass can seed fresh —
      // but only when no one is currently seated, to avoid disrupting
      // an active game. Idempotent: re-runs are no-ops on subsequent
      // deploys because the new names won't match the WHERE clause.
      name: 'archive legacy default tables',
      sql: `
        update tables set archived_at = now()
        where archived_at is null
          and name in (
            'Neon Table', 'Dupster Table',
            'Casual', 'Standard', 'High Roller', 'Heads-Up'
          )
          and not exists (
            select 1 from table_seats s where s.table_id = tables.id
          )
      `,
    },
    {
      // Admin-only test rooms with bots. Hidden from the lobby listing
      // for every non-admin so regular players never see them.
      name: 'tables.is_test_room column',
      sql: 'alter table tables add column if not exists is_test_room boolean not null default false',
    },
    {
      // Bump the max-players cap from 9 to the real-poker 10 (full ring).
      // Drop the existing check first; ADD CONSTRAINT … IF NOT EXISTS only
      // arrived in PG 16, so we go the portable route.
      name: 'tables.max_players cap raised to 10',
      sql: `do $$ begin
        alter table tables drop constraint if exists tables_max_players_check;
        alter table tables add constraint tables_max_players_check
          check (max_players between 2 and 10);
      end $$`,
    },
    {
      // Matching bump for the seat_index check — full ring uses seats 0..9.
      name: 'table_seats.seat_index cap raised to 9',
      sql: `do $$ begin
        alter table table_seats drop constraint if exists table_seats_seat_index_check;
        alter table table_seats add constraint table_seats_seat_index_check
          check (seat_index between 0 and 9);
      end $$`,
    },
    {
      // One-and-only player identity per admin. When the admin uses
      // the Play / Test-room shortcut we link this column to the
      // resulting player row; subsequent shortcuts reuse the same
      // player instead of creating a fresh row for every distinct
      // play_handle the admin has ever set. Renaming play_handle in
      // /admin/me renames THIS player rather than orphaning them.
      name: 'admins.linked_player_id column',
      sql: 'alter table admins add column if not exists linked_player_id uuid references players(id)',
    },
    {
      // Player-initiated chip top-up requests. Pops up in the admin
      // dashboard + Telegram bot for approval. Status moves
      // pending → approved (grants chips) / rejected (no chips).
      name: 'chip_requests table',
      sql: `create table if not exists chip_requests (
        id           uuid primary key default gen_random_uuid(),
        player_id    uuid not null references players(id) on delete cascade,
        amount       bigint check (amount is null or amount > 0),
        message      text,
        status       text not null default 'pending'
                     check (status in ('pending','approved','rejected')),
        created_at   timestamptz not null default now(),
        resolved_at  timestamptz,
        resolved_by  uuid references admins(id),
        granted_amount bigint
      )`,
    },
    {
      name: 'chip_requests.player_status index',
      sql: 'create index if not exists chip_requests_status_idx on chip_requests(status, created_at desc)',
    },
    {
      // Two-way wallet flow. 'topup' (default) — player asks for more
      // chips; admin approval grants them. 'cashout' — player asks to
      // hand chips back; admin approval deducts them. Same audit and
      // notification pipeline, different signed delta on approve.
      name: 'chip_requests.kind column',
      sql: `alter table chip_requests
              add column if not exists kind text not null default 'topup'
              check (kind in ('topup','cashout'))`,
    },
    {
      // Cashout hold/escrow: chips leave the wallet at request time so
      // the wallet immediately reflects the pending cashout. The held
      // amount is refunded if the player cancels or the admin rejects.
      // chip_ledger needs the two new reasons in its CHECK constraint.
      name: 'chip_ledger.reason allows cash_out_hold + cash_out_refund',
      sql: `do $$ begin
        alter table chip_ledger drop constraint if exists chip_ledger_reason_check;
        alter table chip_ledger add constraint chip_ledger_reason_check
          check (reason in (
            'admin_grant','admin_revoke','admin_set',
            'buy_in','cash_out','cash_out_hold','cash_out_refund',
            'win','lose'
          ));
      end $$`,
    },
    {
      // Player-initiated cancellation lives as 'cancelled' so the audit
      // trail distinguishes admin rejections from player withdrawals.
      name: "chip_requests.status allows 'cancelled'",
      sql: `do $$ begin
        alter table chip_requests drop constraint if exists chip_requests_status_check;
        alter table chip_requests add constraint chip_requests_status_check
          check (status in ('pending','approved','rejected','cancelled'));
      end $$`,
    },
    {
      // Audit fields for fairness: deck_hash is the HMAC of the
      // shuffled deck stored at hand start; deck is the full 52-card
      // shuffled order persisted at hand end. Together they let any
      // admin reconstruct a hand and prove the deal wasn't tampered
      // with between deal and showdown.
      name: 'hands.deck_hash + hands.deck columns',
      sql: `alter table hands
              add column if not exists deck_hash text,
              add column if not exists deck text[]`,
    },
    {
      // Admin-managed fake-ad inventory. Lobby pulls active rows in
      // sort_order and rotates through them in the AdCarousel. Lets
      // the admin edit the marketing copy live without a redeploy.
      name: 'ads table',
      sql: `create table if not exists ads (
        id          uuid primary key default gen_random_uuid(),
        kicker      text not null,
        headline    text not null,
        body        text not null,
        disclaimer  text,
        icon        text not null default '✨',
        tone        text not null default 'gold'
                    check (tone in ('gold','smoky','alert')),
        sort_order  int  not null default 0,
        is_active   boolean not null default true,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      )`,
    },
    {
      name: 'ads.active_sort index',
      sql: 'create index if not exists ads_active_sort_idx on ads(is_active, sort_order)',
    },
    {
      // First-boot seed of fake-ads. Mirrors the previously hardcoded
      // 5 ads plus a few new entries so the admin starts with content
      // and can edit / add / hide from the dashboard. Only seeds when
      // the table is still empty so re-runs are no-ops.
      name: 'seed default ads',
      sql: `do $$
        begin
          if not exists (select 1 from ads) then
            insert into ads (kicker, headline, body, disclaimer, icon, tone, sort_order) values
              ('Weekend Tournament', 'Bluffuminati Grand Prix', 'Saturday 22:00 CET · No re-entries · Trophy goes to the most-tilted survivor.',
               'No actual trophy. No actual prize. No actual Saturday.',
               '🏆', 'gold', 10),
              ('Tilt Insurance', 'Lose less, breathe more', 'Hand-tracked emotional volatility coverage. Bad beats fully reimbursed in moral support.',
               'Not financial advice. Not emotional support. Not actually insurance.',
               '🧊', 'smoky', 20),
              ('Bot Coach', 'Train against the house mind', 'Spar with the Bluffuminati bots and steal their preflop ranges. They never sleep, they never tilt, they sometimes raise 5-bet light.',
               'Bots may or may not be plotting against you.',
               '🤖', 'smoky', 30),
              ('About Bluffuminati', 'Private. Invite-only. By filipOS®.', 'A pretend casino for friends. Real chips, no real money, real consequences for your reputation in the group chat.',
               null,
               '👁', 'gold', 40),
              ('Limited Edition', 'Saturday VIP All-In Hour', 'Doubled blinds, halved patience. Show up, shove or fold, leave with stories.',
               'No VIP status conferred. No status of any kind. Don''t come.',
               '⚡', 'alert', 50),
              ('Bluffuminati Lab', 'Now testing: Tilt Detector v0.7', 'AI listens to your raise-clicking rhythm and tells you when to stand up and walk away.',
               'AI listens but does not understand. Like a real friend.',
               '🧪', 'smoky', 60),
              ('Brag Wall', 'Hall of Hero Calls', 'Get featured for the bravest read of the week. Featured slot includes zero chips, zero respect, one screenshot.',
               'Featured slot can be revoked at the algorithm''s whim.',
               '📜', 'gold', 70);
          end if;
        end $$`,
    },
    // future: add more idempotent migrations here
  ];

  for (const s of steps) {
    try {
      await pool.query(s.sql);
      logger.debug({ migration: s.name }, 'migration applied');
    } catch (err) {
      // Don't crash the whole server on a single migration failure —
      // log and continue. The route that needs the column will surface
      // a clear error later.
      logger.error({ err, migration: s.name }, 'migration failed');
    }
  }
  logger.info({ count: steps.length }, 'migrations done');
}
