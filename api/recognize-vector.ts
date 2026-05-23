import type { VercelRequest, VercelResponse } from './types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(501).json({
    error: 'Vector image recognition is not implemented yet.',
    mode: 'prototype-disabled',
    detail:
      'CardDex no longer returns mock high-confidence vector matches. Use /api/recognize for server OCR or the local assisted scanner fallback.',
  });
}
