import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { requirePlayer } from '../auth/middleware.js';

/**
 * Player-visible table data — chat replay + recent hand history.
 * Distinct from /admin/tables which is admin-scoped management.
 */
export function tablesRouter(): Router {
  const r = Router();

  /**
   * GET /tables/:id/chat?limit=50
   * Most recent N chat messages in chronological order so the client
   * can replay them on mount / page reload.
   */
  r.get('/:id/chat', requirePlayer, async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'bad_id' });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const q = await pool.query<{
      id: string;
      body: string;
      created_at: string;
      from: string;
      handle: string;
    }>(
      `select cm.id, cm.body, cm.created_at,
              coalesce(p.display_name, p.player_handle) as from,
              p.player_handle as handle
         from chat_messages cm
         join players p on p.id = cm.player_id
        where cm.table_id = $1
        order by cm.created_at desc
        limit $2`,
      [id.data, limit],
    );

    // reverse so the UI gets oldest-first
    const messages = q.rows.reverse().map((row) => ({
      id: row.id,
      body: row.body,
      at: new Date(row.created_at).getTime(),
      from: row.from,
      handle: row.handle,
    }));
    res.json({ messages });
  });

  /**
   * GET /tables/:id/history?limit=20
   * Last N completed hands at the table with winner summary + the
   * five-card board. Each hand entry includes a `results` array with
   * one row per seated player at the time, so we can surface "you won
   * with two pair" badges client-side.
   */
  r.get('/:id/history', requirePlayer, async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'bad_id' });
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const q = await pool.query(
      `select h.id, h.hand_number, h.board, h.pot_total,
              h.started_at, h.ended_at,
              coalesce(
                (
                  select json_agg(json_build_object(
                    'player_id', hr.player_id,
                    'handle',    p.player_handle,
                    'display',   coalesce(p.display_name, p.player_handle),
                    'winnings',  hr.winnings,
                    'bestHand',  hr.best_hand,
                    'showedDown',hr.showed_down,
                    'holeCards', hr.hole_cards
                  ) order by hr.winnings desc)
                  from hand_results hr
                  join players p on p.id = hr.player_id
                  where hr.hand_id = h.id
                ),
                '[]'::json
              ) as results
         from hands h
        where h.table_id = $1 and h.ended_at is not null
        order by h.hand_number desc
        limit $2`,
      [id.data, limit],
    );
    res.json({ hands: q.rows });
  });

  return r;
}
