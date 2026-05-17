import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { pool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { bootstrapAdmin } from './auth/admin.js';
import { authRouter } from './auth/routes.js';
import { adminRouter } from './admin/routes.js';
import { tablesRouter } from './tables/routes.js';
import { telegramRouter, webhookSecret } from './telegram/routes.js';
import { adsRouter } from './ads/routes.js';
import { setupTelegramWebhook } from './utils/telegram.js';
import { TableManager } from './rooms/tableManager.js';
import { attachSocketServer } from './sockets/index.js';

async function main() {
  // Sanity-check DB
  await pool.query('select 1');
  logger.info('database reachable');

  // Apply idempotent schema migrations BEFORE anything that selects
  // columns those migrations create (e.g. /auth/join needs players.password).
  await runMigrations();

  await bootstrapAdmin();

  const tables = new TableManager();
  await tables.loadTablesFromDb(config.TURN_TIMER_MS);
  await tables.ensureDefaultTables(config.TURN_TIMER_MS);

  const app = express();
  // 128kb is comfortable for the data-URL avatar (typically 8–15kb) plus
  // normal JSON traffic; the avatar route also enforces its own 70kb cap.
  app.use(express.json({ limit: '128kb' }));

  // CORS: a plain `*` in `Access-Control-Allow-Origin` is incompatible
  // with credentials. To support both wildcard ("allow anywhere") and an
  // explicit allow-list, resolve dynamically and echo back the request
  // origin when it matches.
  const allowList = new Set(config.allowedOrigins);
  const allowAny = allowList.has('*');
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);              // server-to-server / curl
        if (allowAny) return cb(null, true);             // wildcard: echo origin
        if (allowList.has(origin)) return cb(null, true);
        return cb(new Error(`cors_block:${origin}`));
      },
      credentials: true,
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));
  app.use('/auth', authRouter(tables));

  // Socket server is attached first so the admin routes can push events
  // (chip updates, ban kicks, password resets) to live player sockets.
  const server = http.createServer(app);
  const io = attachSocketServer(server, tables);

  app.use('/admin', adminRouter(tables, io));
  app.use('/tables', tablesRouter());
  app.use('/telegram', telegramRouter());
  app.use('/ads', adsRouter());

  // Express error middleware — any async route handler that throws
  // gets here instead of bubbling into the global unhandledRejection
  // path (which on Node 20 will kill the process by default).
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err, path: req.path, method: req.method }, 'route handler threw');
    if (res.headersSent) return;
    const msg = err instanceof Error ? err.message : 'internal_error';
    res.status(500).json({ error: msg });
  });

  server.listen(config.SERVER_PORT, () => {
    logger.info(
      { port: config.SERVER_PORT, origins: config.allowedOrigins },
      'neon-poker server up',
    );
  });

  // Register the public-bot webhook with Telegram now that we're live.
  // No-op (with a log line) when the public-bot token isn't configured;
  // tries the explicit SERVER_PUBLIC_URL first, then Render's
  // automatically-injected RENDER_EXTERNAL_URL.
  const publicBotToken = config.TELEGRAM_PUBLIC_BOT_TOKEN;
  const serverBase = (config.SERVER_PUBLIC_URL ?? config.RENDER_EXTERNAL_URL ?? '')
    .replace(/\/$/, '');
  if (publicBotToken && serverBase) {
    const secret = webhookSecret(publicBotToken);
    void setupTelegramWebhook({
      botToken: publicBotToken,
      webhookUrl: `${serverBase}/telegram/webhook/${secret}`,
    });
  } else if (publicBotToken && !serverBase) {
    logger.warn(
      'TELEGRAM_PUBLIC_BOT_TOKEN set but no SERVER_PUBLIC_URL / RENDER_EXTERNAL_URL — skipping webhook registration',
    );
  }

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'shutting down');
      server.close(() => process.exit(0));
    });
  }
}

// Belt-and-braces: any async path that escapes Express's error
// middleware (e.g. socket handlers, background timers) lands here.
// We log and keep running instead of letting Node 20's default
// behaviour kill the process and trigger a Render restart loop.
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled rejection — server stays up');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception — server stays up');
});

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  process.exit(1);
});
