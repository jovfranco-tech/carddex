/**
 * Simple in-memory IP-based rate limiter for Vercel Serverless Functions.
 * Each endpoint maintains its own Map so limits are per-function.
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
 *   const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
 *   if (!limiter.check(ip)) return res.status(429).json({ error: 'Too many requests' });
 */

interface RateLimiterOptions {
  /** Maximum number of requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds (default: 60 000 = 1 minute) */
  windowMs?: number;
}

interface LimiterEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter({ maxRequests, windowMs = 60_000 }: RateLimiterOptions) {
  const store = new Map<string, LimiterEntry>();

  return {
    /**
     * Returns true if the request is allowed, false if it should be rate-limited.
     */
    check(ip: string): boolean {
      const now = Date.now();
      const entry = store.get(ip);

      if (!entry || now > entry.resetAt) {
        store.set(ip, { count: 1, resetAt: now + windowMs });
        return true;
      }

      if (entry.count >= maxRequests) {
        return false;
      }

      entry.count += 1;
      return true;
    },

    /** Returns seconds until the window resets for this IP */
    retryAfter(ip: string): number {
      const entry = store.get(ip);
      if (!entry) return 0;
      return Math.ceil((entry.resetAt - Date.now()) / 1000);
    },
  };
}
