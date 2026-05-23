import type { VercelRequest, VercelResponse } from './types.js';
import { createRateLimiter } from './_rateLimiter.js';

const limiter = createRateLimiter({ maxRequests: 60, windowMs: 60_000 });

function sanitizeText(value: unknown, max = 240): string {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/(sk-[A-Za-z0-9_-]+)/g, '[redacted-key]')
    .slice(0, max);
}

function sanitizeUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ''));
    return `${url.origin}${url.pathname}`.slice(0, 240);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Support navigator.sendBeacon which sends POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (!(await limiter.check(ip))) {
    return res.status(429).json({
      error: 'Demasiada telemetría. Espera un momento.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  if (process.env.ENABLE_TELEMETRY !== 'true') {
    return res.status(204).end();
  }

  try {
    let body = req.body;
    // sendBeacon payload sometimes arrives as a raw string
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // Fallback for form-encoded payloads
      }
    }

    const { type, data } = body;
    const timestamp = new Date().toISOString();

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (type === 'error') {
      if (supabaseUrl && supabaseKey && data) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/telemetry_logs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              ip: 'redacted',
              type: 'error',
              context: sanitizeText(data.context || 'global', 80),
              message: sanitizeText(data.message || 'Unknown'),
              stack: null,
              url: sanitizeUrl(data.url),
              user_agent: null,
              created_at: timestamp
            })
          });
        } catch (dbErr) {
          console.warn('[Telemetry Server] Failed to insert sanitized error event.');
        }
      }
    } else if (type === 'event') {
      if (supabaseUrl && supabaseKey && data) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/telemetry_logs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              ip: 'redacted',
              type: 'event',
              context: sanitizeText(data.name || 'custom', 80),
              message: sanitizeText(JSON.stringify(data.metadata || {}), 300),
              url: sanitizeUrl(data.url),
              created_at: timestamp
            })
          });
        } catch (dbErr) {
          console.warn('[Telemetry Server] Failed to insert sanitized event.');
        }
      }
    }

    return res.status(200).json({ status: 'logged' });
  } catch (err: any) {
    return res.status(400).json({ error: 'Invalid telemetry payload' });
  }
}
