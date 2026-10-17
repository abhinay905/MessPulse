/**
 * config.ts — environment configuration validated with zod at boot.
 * App refuses to start if any required variable is missing or malformed.
 * DOC3 §3.1: config/ is the only place that reads process.env.
 */
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  MONGO_URL: z.string().url('MONGO_URL must be a valid URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  INGEST_KEY: z.string().min(8, 'INGEST_KEY must be at least 8 characters'),

  MAILER_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional(),

  OTP_ALLOWED_DOMAINS: z.string().default(''),

  DEFAULT_MESS_ID: z.string().default('mess-default'),
  ALLOW_SIMULATOR: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
});

function loadConfig() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(
      `[FATAL] Missing or invalid environment variables:\n${issues}\n\nSee .env.example for required values.`,
    );
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
