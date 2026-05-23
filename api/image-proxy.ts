import type { VercelRequest, VercelResponse } from './types.js';
import { createRateLimiter } from './_rateLimiter.js';

const limiter = createRateLimiter({ maxRequests: 90, windowMs: 60_000 });
const MAX_IMAGE_BYTES = 4_000_000;
const ALLOWED_DIRECT_IMAGE_HOSTS = new Set(['images.pokemontcg.io']);

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function isAllowedPokemonImageUrl(value: string): boolean {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.protocol === 'https:' && ALLOWED_DIRECT_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedProxyTarget(value: string): boolean {
  const parsedUrl = new URL(value);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    return false;
  }

  if (isAllowedPokemonImageUrl(value)) return true;

  if (parsedUrl.hostname === 'images.weserv.nl') {
    const nestedUrl = parsedUrl.searchParams.get('url') || '';
    const fallbackUrl = parsedUrl.searchParams.get('default') || '';
    return (
      isAllowedPokemonImageUrl(nestedUrl) &&
      (!fallbackUrl || isAllowedPokemonImageUrl(fallbackUrl))
    );
  }

  return false;
}

/**
 * Serverless image proxy to bypass CORS, corporate firewalls, and network blockers.
 * Fetches the requested card art from pokemontcg.io or images.weserv.nl
 * and serves it with aggressive cache headers from the PWA's own domain.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!(await limiter.check(ip))) {
    return res.status(429).json({
      error: 'Demasiadas solicitudes de imagen. Espera un momento.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  const imageUrl = firstQueryValue(req.query.url);
  if (!imageUrl) {
    return res.status(400).json({ error: 'URL query parameter is required' });
  }

  // Defensive validation of target URL
  try {
    if (!isAllowedProxyTarget(imageUrl)) {
      return res.status(403).json({ error: 'Forbidden target domain' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid target URL' });
  }

  try {
    const response = await fetch(imageUrl, {
      redirect: 'error',
      headers: {
        'User-Agent': 'CardDexImageProxy/1.1',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: 'Target is not an image' });
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image is too large' });
    }

    // Set aggressive long-term cache control headers for immutable card art
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.warn('[Image Proxy] Failed to fetch allowed image target.');
    return res.status(502).json({ error: 'Unable to proxy image' });
  }
}
