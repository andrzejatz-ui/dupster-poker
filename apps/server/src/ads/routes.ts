import { Router } from 'express';
import { pool } from '../db/client.js';

/**
 * Public ads endpoint — the lobby pulls the active fake-ad inventory
 * here on mount and rotates through it in the AdCarousel. No auth:
 * the content is decorative and identical for every visitor.
 */
export function adsRouter(): Router {
  const r = Router();

  r.get('/', async (_req, res) => {
    try {
      const q = await pool.query<{
        id: string;
        kicker: string;
        headline: string;
        body: string;
        disclaimer: string | null;
        icon: string;
        tone: 'gold' | 'smoky' | 'alert';
        sort_order: number;
      }>(
        `select id, kicker, headline, body, disclaimer, icon, tone, sort_order
           from ads
          where is_active = true
          order by sort_order asc, created_at asc
          limit 50`,
      );
      res.set('Cache-Control', 'public, max-age=60');
      res.json({
        ads: q.rows.map((row) => ({
          id: row.id,
          kicker: row.kicker,
          headline: row.headline,
          body: row.body,
          disclaimer: row.disclaimer,
          icon: row.icon,
          tone: row.tone,
        })),
      });
    } catch {
      // Lobby renders a hardcoded fallback when this fails, so degrading
      // to an empty list rather than 500 keeps the page functional.
      res.json({ ads: [] });
    }
  });

  return r;
}
