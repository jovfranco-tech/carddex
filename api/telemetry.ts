import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Support navigator.sendBeacon which sends POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || req.socket?.remoteAddress
      || 'unknown';

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (type === 'error') {
      console.error(`[TELEMETRY ERROR] [${timestamp}] [IP: ${ip}] [Context: ${data?.context}] ${data?.message}\nStack: ${data?.stack || 'No stack'}\nURL: ${data?.url}\nUserAgent: ${data?.userAgent}`);
      
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
              ip,
              type: 'error',
              context: data.context || 'global',
              message: data.message || 'Unknown',
              stack: data.stack || null,
              url: data.url || null,
              user_agent: data.userAgent || null,
              created_at: timestamp
            })
          });
        } catch (dbErr) {
          console.warn('[Telemetry Server] Failed to insert error to database:', dbErr);
        }
      }
    } else if (type === 'event') {
      console.log(`[TELEMETRY EVENT] [${timestamp}] [IP: ${ip}] Name: ${data?.name}\nMetadata: ${JSON.stringify(data?.metadata || {})}\nURL: ${data?.url}`);

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
              ip,
              type: 'event',
              context: data.name || 'custom',
              message: JSON.stringify(data.metadata || {}),
              url: data.url || null,
              created_at: timestamp
            })
          });
        } catch (dbErr) {
          console.warn('[Telemetry Server] Failed to insert event to database:', dbErr);
        }
      }
    }

    return res.status(200).json({ status: 'logged' });
  } catch (err: any) {
    console.error('[Telemetry Server] Parsing error:', err);
    return res.status(500).json({ error: 'Internal telemetry parsing error' });
  }
}
