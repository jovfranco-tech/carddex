import type { VercelRequest, VercelResponse } from './types.js';
import { createRateLimiter } from './_rateLimiter.js';
import { getServerAiKey, getServerAiEndpoint, mapModel, serverAiUnavailable } from './_serverAi.js';

const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!(await limiter.check(ip))) {
    return res.status(429).json({
      error: 'Demasiadas solicitudes. Espera un momento antes de construir otro mazo.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'El prompt es requerido' });
  }

  const safePrompt = String(prompt).slice(0, 500);

  const apiKey = getServerAiKey();
  if (!apiKey) {
    return res.status(503).json(serverAiUnavailable('El servicio LLM'));
  }

  const systemPrompt = `Eres un experto constructor de mazos de Pokémon TCG. Tu tarea es generar una lista de mazo de exactamente 60 cartas en formato JSON en base al prompt del usuario.
    
  El JSON retornado debe tener la siguiente estructura exacta:
  {
    "name": "Nombre sugerido para el mazo",
    "archetype": "Breve descripción de la estrategia (20 palabras)",
    "cards": [
      { "name": "Nombre oficial de la carta en inglés", "quantity": 4, "type": "Pokemon" },
      { "name": "Professor's Research", "quantity": 4, "type": "Trainer" },
      { "name": "Fire Energy", "quantity": 10, "type": "Energy" }
    ]
  }

  INSTRUCCIONES IMPORTANTES:
  1. La suma total de las cantidades ("quantity") de todas las cartas en el arreglo "cards" DEBE SER EXACTAMENTE 60.
  2. Utiliza cartas oficiales de las expansiones más recientes del formato Estándar (Scarlet & Violet).
  3. Asegura sinergias competitivas.
  4. Usa nombres oficiales exactos en inglés.
  5. Retorna ÚNICAMENTE el objeto JSON puro sin bloques de código Markdown.`;

  try {
    // Set SSE headers for real-time streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const openAIRes = await fetch(`${getServerAiEndpoint()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: mapModel('gpt-4o-mini'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: safePrompt },
        ],
        max_tokens: 1200,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!openAIRes.ok || !openAIRes.body) {
      await openAIRes.text().catch(() => '');
      console.warn('[Deck Builder] OpenAI request failed.');
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Error al contactar la IA' })}\n\n`);
      return res.end();
    }

    const reader = openAIRes.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            // Stream each token as SSE event for typewriter effect
            res.write(`event: token\ndata: ${JSON.stringify({ token: delta })}\n\n`);
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    // Try to parse the accumulated JSON and send it as the final event
    try {
      // Strip markdown code fences if present
      const cleaned = accumulated.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const deckSpec = JSON.parse(cleaned);
      res.write(`event: done\ndata: ${JSON.stringify(deckSpec)}\n\n`);
    } catch {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'No se pudo parsear la respuesta de la IA' })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.warn('[Deck Builder] SSE request failed.');
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Error interno en el servidor' })}\n\n`);
      res.end();
    } catch {
      res.end();
    }
  }
}
