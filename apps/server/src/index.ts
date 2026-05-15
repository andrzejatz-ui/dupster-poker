import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { pool } from './db/client.js';
import { bootstrapAdmin } from './auth/admin.js';
import { authRouter } from './auth/routes.js';
import { adminRouter } from './admin/routes.js';
import { TableManager } from './rooms/tableManager.js';
import { attachSocketServer } from './sockets/index.js';

async function main() {
  // Sanity-check DB
  await pool.query('select 1');
  logger.info('database reachable');

  await bootstrapAdmin();

  const tables = new TableManager();
  await tables.loadTablesFromDb(config.TURN_TIMER_MS);

  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));
  app.use('/auth', authRouter());
  app.use('/admin', adminRouter(tables));

  const server = http.createServer(app);
  attachSocketServer(server, tables);

  server.listen(config.SERVER_PORT, () => {
    logger.info(
      { port: config.SERVER_PORT, origins: config.allowedOrigins },
      'neon-poker server up',
    );
  });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'shutting down');
      server.close(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  process.exit(1);
});
