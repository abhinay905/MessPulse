import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      MONGO_URL: 'mongodb://localhost:27017/messpulse_test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-jwt-secret-min-16-characters-long',
      JWT_EXPIRES_IN: '7d',
      INGEST_KEY: 'test-ingest-key-1234',
      MAILER_PROVIDER: 'console',
      OTP_ALLOWED_DOMAINS: 'college.edu,ait.ac.in',
      DEFAULT_MESS_ID: 'mess-default',
      ALLOW_SIMULATOR: 'true',
    },
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/ports.ts', 'src/core/**/*.test.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
