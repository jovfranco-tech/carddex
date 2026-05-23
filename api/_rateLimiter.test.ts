import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRateLimitKey, createRateLimiter } from './_rateLimiter';

const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  delete process.env.RATE_LIMIT_SALT;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetEnv();
});

describe('rate limiter', () => {
  it('limits repeated requests in the local fallback store', async () => {
    resetEnv();
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 1_000 });

    await expect(limiter.check('198.51.100.42')).resolves.toBe(true);
    await expect(limiter.check('198.51.100.42')).resolves.toBe(true);
    await expect(limiter.check('198.51.100.42')).resolves.toBe(false);
    await expect(limiter.check('198.51.100.99')).resolves.toBe(true);
    expect(limiter.retryAfter('198.51.100.42')).toBeGreaterThan(0);
  });

  it('hashes client identifiers before using them as storage keys', () => {
    resetEnv();
    process.env.RATE_LIMIT_SALT = 'test-salt';

    const key = buildRateLimitKey('203.0.113.7');

    expect(key).toMatch(/^rate_limit:[a-f0-9]{40}$/);
    expect(key).not.toContain('203.0.113.7');
  });

  it('does not use the browser Supabase anon key for server-side rate limiting', async () => {
    resetEnv();
    process.env.VITE_SUPABASE_URL = 'https://project.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'public-anon-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1_000 });

    await expect(limiter.check('198.51.100.10')).resolves.toBe(true);
    await expect(limiter.check('198.51.100.10')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a hashed key for Vercel KV rate limiting', async () => {
    resetEnv();
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'server-kv-token';
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes('/incr/')) {
          return new Response(JSON.stringify({ result: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({ result: true }), { status: 200 });
      }),
    );

    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1_000 });

    await expect(limiter.check('192.0.2.44')).resolves.toBe(true);
    expect(urls.join(' ')).not.toContain('192.0.2.44');
    expect(decodeURIComponent(urls[0])).toContain('rate_limit:');
  });
});
