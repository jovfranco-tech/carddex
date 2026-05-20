/**
 * Distributed, hybrid rate limiter for Vercel Serverless Functions.
 * Supports Vercel KV (Redis) and Supabase database-backed rate limiting,
 * falling back seamlessly to local in-memory Map.
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
  const isSupabaseAvailable = Boolean(process.env.VITE_SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY));

  return {
    /**
     * Returns true if the request is allowed, false if it should be rate-limited.
     */
    async check(ip: string): Promise<boolean> {
      // 1. Attempt Vercel KV (Redis)
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
          console.warn('Vercel KV rate limiter failed, attempting Supabase fallback...', e);
        }
      }

      // 2. Attempt Supabase Distributed DB Rate Limiter
      if (isSupabaseAvailable) {
        try {
          const url = process.env.VITE_SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
          
          const now = Date.now();
          const resetAt = new Date(now + windowMs).toISOString();

          // Fetch the current record for this IP
          const fetchRes = await fetch(`${url}/rest/v1/rate_limits?ip=eq.${encodeURIComponent(ip)}`, {
            headers: {
              'apikey': key!,
              'Authorization': `Bearer ${key}`
            }
          });

          if (fetchRes.ok) {
            const records = await fetchRes.json();
            const record = records[0];

            if (!record) {
              // Insert new IP record
              await fetch(`${url}/rest/v1/rate_limits`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': key!,
                  'Authorization': `Bearer ${key}`,
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  ip,
                  count: 1,
                  reset_at: resetAt
                })
              });
              return true;
            }

            const recordResetAt = new Date(record.reset_at).getTime();

            if (now > recordResetAt) {
              // Reset window
              await fetch(`${url}/rest/v1/rate_limits?ip=eq.${encodeURIComponent(ip)}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': key!,
                  'Authorization': `Bearer ${key}`,
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  count: 1,
                  reset_at: resetAt
                })
              });
              return true;
            }

            if (record.count >= maxRequests) {
              // Maintain local sync for sync retryAfter
              store.set(ip, { count: record.count, resetAt: recordResetAt });
              return false;
            }

            // Increment count
            await fetch(`${url}/rest/v1/rate_limits?ip=eq.${encodeURIComponent(ip)}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': key!,
                'Authorization': `Bearer ${key}`,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                count: record.count + 1
              })
            });

            store.set(ip, { count: record.count + 1, resetAt: recordResetAt });
            return true;
          }
        } catch (e) {
          console.warn('Supabase rate limiter failed, falling back to local memory:', e);
        }
      }

      // 3. Fallback to Local In-Memory
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
      return Math.max(0, Math.ceil((entry.resetAt - Date.now()) / 1000));
    },
  };
}
