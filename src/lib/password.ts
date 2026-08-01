import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

const PREFIX = 'scrypt$';
const KEYLEN = 64;
const SALT_LEN = 16;

/**
 * Hash a password with scrypt. Returns `scrypt$<saltB64>$<hashB64>`.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error('Password required');
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = await scrypt(password, salt, KEYLEN);
  return `${PREFIX}${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function isPasswordHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX) && value.split('$').length === 3;
}

/**
 * Verify password against a scrypt hash, or (legacy) plaintext equality
 * so existing deployments can migrate on first successful login.
 * Returns { ok, needsRehash }.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!password || !stored) return { ok: false, needsRehash: false };

  if (isPasswordHash(stored)) {
    const parts = stored.split('$');
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const derived = await scrypt(password, salt, expected.length);
    const ok =
      expected.length === derived.length &&
      crypto.timingSafeEqual(expected, derived);
    return { ok, needsRehash: false };
  }

  // Legacy plaintext (pre-hardening)
  const a = Buffer.from(password);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return { ok: false, needsRehash: false };
  const ok = crypto.timingSafeEqual(a, b);
  return { ok, needsRehash: ok };
}

/**
 * Production gate: admin password and NEXTAUTH_SECRET must be set and non-default.
 */
export function productionSecretsOk(opts: {
  adminPassword: string | null | undefined;
  nextAuthSecret: string | null | undefined;
  nodeEnv?: string;
}): { ok: boolean; reason?: string } {
  const env = opts.nodeEnv ?? process.env.NODE_ENV;
  if (env !== 'production') return { ok: true };

  const secret = (opts.nextAuthSecret || '').trim();
  if (!secret || secret.length < 16) {
    return { ok: false, reason: 'NEXTAUTH_SECRET missing or too short in production' };
  }

  const pw = (opts.adminPassword || '').trim();
  if (!pw) {
    return { ok: false, reason: 'ADMIN_PASSWORD missing in production' };
  }
  if (pw === 'admin123' || (!isPasswordHash(pw) && pw.length < 8)) {
    return { ok: false, reason: 'ADMIN_PASSWORD is weak or default in production' };
  }
  return { ok: true };
}
