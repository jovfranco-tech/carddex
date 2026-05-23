import type { VercelRequest, VercelResponse } from './types.js';
import { createRateLimiter } from './_rateLimiter.js';
import { getServerOpenAiKey, serverAiUnavailable } from './_serverAi.js';

const limiter = createRateLimiter({ maxRequests: 15, windowMs: 60_000 });

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
      error: 'Demasiadas solicitudes. Espera un momento.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  const { currentDeck, userMessage, history } = req.body;
  if (!currentDeck || !userMessage) {
    return res.status(400).json({ error: 'currentDeck y userMessage son requeridos' });
  }

  const apiKey = getServerOpenAiKey();
  if (!apiKey) {
    return res.status(503).json(serverAiUnavailable('El servicio LLM'));
  }

  const safeMessage = String(userMessage).slice(0, 400);
  const safeDeck = JSON.stringify(currentDeck).slice(0, 3000);

  const systemPrompt = `Eres un copiloto experto de mazos Pokémon TCG. El usuario ya generó un mazo y quiere refinarlo mediante conversación.

MAZO ACTUAL:
${safeDeck}

Tu rol es:
1. Responder preguntas sobre el mazo (sinergias, puntos débiles, estrategias).
2. Sugerir cambios específicos cuando el usuario lo pida (siempre en formato: "Quita X copias de [Carta A] y agrega X copias de [Carta B]").
3. Mantener el total en exactamente 60 cartas si sugieres cambios.
4. Ser conciso, directo y experto. Máximo 3 párrafos por respuesta.
5. Si el usuario pide cambios concretos, al final de tu respuesta incluye un bloque JSON separado con este formato:
{ "changes": [ { "remove": "Nombre Carta", "removeQty": 2, "add": "Nueva Carta", "addQty": 2 } ] }
Si NO hay cambios que aplicar en esta respuesta, no incluyas el bloque JSON.`;

  try {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Build conversation messages
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add chat history (max last 6 messages)
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-6);
      for (const h of recentHistory) {
        if (h.role && h.content) {
          messages.push({ role: h.role, content: String(h.content).slice(0, 600) });
        }
      }
    }

    messages.push({ role: 'user', content: safeMessage });

    const openAIRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 600,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!openAIRes.ok || !openAIRes.body) {
      await openAIRes.text().catch(() => '');
      console.warn('[Deck Refiner] OpenAI request failed.');
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
            res.write(`event: token\ndata: ${JSON.stringify({ token: delta })}\n\n`);
          }
        } catch {
          // skip
        }
      }
    }

    // Try to extract JSON changes block from the accumulated response
    let changes = null;
    const jsonMatch = accumulated.match(/\{\s*"changes"\s*:\s*\[.*?\]\s*\}/s);
    if (jsonMatch) {
      try {
        changes = JSON.parse(jsonMatch[0]);
      } catch {
        // ignore
      }
    }

    res.write(`event: done\ndata: ${JSON.stringify({ fullText: accumulated, changes })}\n\n`);
    res.end();
  } catch (error) {
    console.warn('[Deck Refiner] SSE request failed.');
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Error interno en el servidor' })}\n\n`);
      res.end();
    } catch {
      res.end();
    }
  }
}
