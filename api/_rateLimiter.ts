/**
 * Hybrid IP-based rate limiter for Vercel Serverless Functions.
 * Uses global persistent Redis/KV if available, otherwise falls back to local in-memory.
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

  const isRedisAvailable = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  return {
    /**
     * Returns true if the request is allowed, false if it should be rate-limited.
     */
    async check(ip: string): Promise<boolean> {
      if (isRedisAvailable) {
        try {
          const url = process.env.KV_REST_API_URL;
          const token = process.env.KV_REST_API_TOKEN;
          const key = `rate_limit:${ip}`;
          const windowSec = Math.ceil(windowMs / 1000);

          // Increment count in Redis via REST API
          const incrRes = await fetch(`${url}/incr/${key}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!incrRes.ok) throw new Error('Redis INCR failed');
          const { result } = await incrRes.json();
          const count = Number(result);

          if (count === 1) {
            // Set expiration for new keys
            await fetch(`${url}/expire/${key}/${windowSec}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
          }

          return count <= maxRequests;
        } catch (e) {
          console.warn('Vercel KV/Redis rate limiter failed, falling back to memory:', e);
        }
      }

      // Memory fallback
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

    /** Returns seconds until the window resets for this IP (Memory fallback only) */
    retryAfter(ip: string): number {
      const entry = store.get(ip);
      if (!entry) return 0;
      return Math.max(0, Math.ceil((entry.resetAt - Date.now()) / 1000));
    },
  };
}
