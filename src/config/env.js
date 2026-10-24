// Single place that reads process.env. Locally it is filled by `node --env-file=.env`,
// in Docker by docker-compose.
const isProduction = process.env.NODE_ENV === 'production';

const required = ['DATABASE_URL', ...(isProduction ? ['SESSION_SECRET'] : [])];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key} (see .env.example)`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL,
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  // Signs the session cookie. Dev fallback only; production refuses to start without one.
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-insecure-session-secret',
  sessionMaxAgeHours: Number(process.env.SESSION_MAX_AGE_HOURS ?? 8),
};
