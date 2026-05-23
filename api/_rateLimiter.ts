import { createHash } from 'node:crypto';

/**
 * Distributed, hybrid rate limiter for Vercel Serverless Functions.
 * Supports Vercel KV (Redis) and Supabase database-backed rate limiting,
 * falling back to local in-memory Map for demo/dev environments.
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

function safeHttpsBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function buildRateLimitKey(clientId: string): string {
  const normalizedClientId = clientId.trim() || 'unknown';
  const salt =
    process.env.RATE_LIMIT_SALT ||
    process.env.KV_REST_API_TOKEN ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'carddex-rate-limit';
  const digest = createHash('sha256')
    .update(`${salt}:${normalizedClientId}`)
    .digest('hex')
    .slice(0, 40);

  return `rate_limit:${digest}`;
}

export function createRateLimiter({ maxRequests, windowMs = 60_000 }: RateLimiterOptions) {
  const store = new Map<string, LimiterEntry>();

  const redisUrl = safeHttpsBaseUrl(process.env.KV_REST_API_URL);
  const redisToken = process.env.KV_REST_API_TOKEN;
  const supabaseUrl = safeHttpsBaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isRedisAvailable = Boolean(redisUrl && redisToken);
  const isSupabaseAvailable = Boolean(supabaseUrl && supabaseServiceKey);

  return {
    /**
     * Returns true if the request is allowed, false if it should be rate-limited.
     */
    async check(ip: string): Promise<boolean> {
      const key = buildRateLimitKey(ip);

      // 1. Attempt Vercel KV (Redis)
      if (isRedisAvailable) {
        try {
          const windowSec = Math.ceil(windowMs / 1000);

          // Increment count in Redis via REST API
          const incrRes = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${redisToken}` },
          });
          if (!incrRes.ok) throw new Error('Redis INCR failed');
          const { result } = await incrRes.json();
          const count = Number(result);

          if (count === 1) {
            // Set expiration for new keys
            await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${windowSec}`, {
              headers: { Authorization: `Bearer ${redisToken}` },
            });
          }

          return count <= maxRequests;
        } catch {
          console.warn('Vercel KV rate limiter failed, attempting Supabase fallback.');
        }
      }

      // 2. Attempt Supabase Distributed DB Rate Limiter
      if (isSupabaseAvailable) {
        try {
          const now = Date.now();
          const resetAt = new Date(now + windowMs).toISOString();

          // The column is named `ip` for compatibility, but stores a salted hash.
          const fetchRes = await fetch(`${supabaseUrl}/rest/v1/rate_limits?ip=eq.${encodeURIComponent(key)}`, {
            headers: {
              'apikey': supabaseServiceKey!,
              'Authorization': `Bearer ${supabaseServiceKey}`,
            }
          });

          if (fetchRes.ok) {
            const records = await fetchRes.json();
            const record = records[0];

            if (!record) {
              // Insert new IP record
              await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': supabaseServiceKey!,
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  ip: key,
                  count: 1,
                  reset_at: resetAt
                })
              });
              return true;
            }

            const recordResetAt = new Date(record.reset_at).getTime();

            if (now > recordResetAt) {
              // Reset window
              await fetch(`${supabaseUrl}/rest/v1/rate_limits?ip=eq.${encodeURIComponent(key)}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': supabaseServiceKey!,
                  'Authorization': `Bearer ${supabaseServiceKey}`,
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
              store.set(key, { count: record.count, resetAt: recordResetAt });
              return false;
            }

            // Increment count
            await fetch(`${supabaseUrl}/rest/v1/rate_limits?ip=eq.${encodeURIComponent(key)}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseServiceKey!,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                count: record.count + 1
              })
            });

            store.set(key, { count: record.count + 1, resetAt: recordResetAt });
            return true;
          }
        } catch {
          console.warn('Supabase rate limiter failed, falling back to local memory.');
        }
      }

      // 3. Fallback to Local In-Memory
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
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
      const entry = store.get(buildRateLimitKey(ip));
      if (!entry) return 0;
      return Math.max(0, Math.ceil((entry.resetAt - Date.now()) / 1000));
    },
  };
}
