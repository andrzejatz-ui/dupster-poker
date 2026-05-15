import 'dotenv/config';
import { z } from 'zod';

// Render and Fly set PORT; we keep SERVER_PORT for local consistency.
// PORT wins if both are set (cloud convention).
if (process.env.PORT && !process.env.SERVER_PORT) {
  process.env.SERVER_PORT = process.env.PORT;
}

const Env = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be ≥32 chars'),
  BOOTSTRAP_ADMIN_USERNAME: z.string().min(3),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8),
  TURN_TIMER_MS: z.coerce.number().int().positive().default(25_000),
  RECONNECT_GRACE_MS: z.coerce.number().int().positive().default(30_000),
  MIN_BUY_IN_MULTIPLIER: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
} as const;

export type AppConfig = typeof config;
