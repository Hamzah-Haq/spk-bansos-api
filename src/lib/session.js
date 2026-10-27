import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';

const PgStore = connectPgSimple(session);

export const SESSION_COOKIE = 'spk.sid';

// Sessions live in the `session` table (created by a Prisma migration, not by the library).
export const sessionStore = new PgStore({
  conString: env.databaseUrl,
  tableName: 'session',
  createTableIfMissing: false,
  pruneSessionInterval: 15 * 60, // seconds
});

export const sessionMiddleware = session({
  name: SESSION_COOKIE,
  secret: env.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false, // no row/cookie until login
  rolling: true, // each request pushes the expiry forward (idle timeout)
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // HTTPS-only when the request came over HTTPS (req.secure honours X-Forwarded-Proto via trust proxy)
    secure: 'auto',
    maxAge: env.sessionMaxAgeHours * 60 * 60 * 1000,
  },
});

// express-session is callback-based; these let controllers `await` it.
export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

// Logs a user out on every device (after a password change/reset, deactivation or deletion).
// `exceptSid` keeps the caller's own session when they changed their own password.
export function revokeUserSessions(userId, exceptSid = '') {
  return prisma.$executeRaw`
    DELETE FROM "session"
    WHERE (sess ->> 'userId')::int = ${userId} AND sid <> ${exceptSid}
  `;
}
