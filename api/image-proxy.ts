import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Serverless image proxy to bypass CORS, corporate firewalls, and network blockers.
 * Fetches the requested card art from pokemontcg.io or images.weserv.nl
 * and serves it with aggressive cache headers from the PWA's own domain.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).send('URL query parameter is required');
  }

  // Defensive validation of target URL
  try {
    const parsedUrl = new URL(imageUrl);
    const host = parsedUrl.hostname;
    
    // Only allow verified image host domains
    const isAllowed = [
      'images.pokemontcg.io',
      'images.weserv.nl',
      'pokemontcg.io',
    ].some(domain => host === domain || host.endsWith('.' + domain));

    if (!isAllowed) {
      return res.status(403).send('Forbidden target domain');
    }
  } catch {
    return res.status(400).send('Invalid target URL');
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'CarddexProxy/1.0',
      },
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();

    // Set aggressive long-term cache control headers for immutable card art
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Image proxy failed:', error);
    return res.status(500).send('Internal server error proxying card image');
  }
}
