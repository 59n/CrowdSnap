/**
 * Simple in-memory sliding-window rate limiter (single Node process).
 * Not shared across instances — fine for self-hosted single host.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type Bucket = { timestamps: number[] };

const store = new Map<string, Bucket>();

export function rateLimitKey(...parts: string[]): string {
  return parts.filter(Boolean).join(':');
}

/** Extract client IP from request headers (proxy-aware). */
export function ipFromHeaders(headers: Headers | { get(name: string): string | null }): string {
  const xf = headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim() || 'unknown';
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Allow at most `max` hits within `windowMs` for `key`.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    store.set(key, bucket);
  }

  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
    };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, max - bucket.timestamps.length),
    retryAfterMs: 0,
  };
}

/** Test helper: clear all buckets */
export function resetRateLimits() {
  store.clear();
}

// Default policies used by routes
// Env overrides (optional): UPLOAD_RATE_PER_IP, UPLOAD_RATE_PER_EVENT, LOGIN_RATE_MAX
export const LOGIN_LIMIT = {
  max: Number(process.env.LOGIN_RATE_MAX) || 10,
  windowMs: 15 * 60 * 1000,
}; // 10 / 15 min per IP
// Wedding-friendly defaults: many guests may share one public Wi‑Fi IP (CGNAT/hotel)
export const UPLOAD_IP_LIMIT = {
  max: Number(process.env.UPLOAD_RATE_PER_IP) || 300,
  windowMs: 60 * 1000,
}; // 300 / min per IP
export const UPLOAD_EVENT_LIMIT = {
  max: Number(process.env.UPLOAD_RATE_PER_EVENT) || 2000,
  windowMs: 60 * 1000,
}; // 2000 / min per event
