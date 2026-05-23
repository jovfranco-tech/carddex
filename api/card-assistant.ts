import type { VercelRequest, VercelResponse } from './types.js';
import { createRateLimiter } from './_rateLimiter.js';
import { getServerOpenAiKey, serverAiUnavailable } from './_serverAi.js';

/** 30 requests per hour per IP — enough for normal use, stops abuse. */
const limiter = createRateLimiter({ maxRequests: 30, windowMs: 60 * 60 * 1000 });

/** Max allowed size of the serialised cardContext payload (bytes). */
const MAX_CONTEXT_BYTES = 12_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    'unknown';

  const allowed = await limiter.check(ip);
  if (!allowed) {
    const retryAfter = limiter.retryAfter(ip);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Demasiadas peticiones. Por favor espera unos minutos antes de volver a preguntar.',
      retryAfter,
    });
  }

  try {
    const { messages, cardContext } = req.body;

    // ── Input validation ───────────────────────────────────────────────────
    if (!messages || !Array.isArray(messages) || !cardContext) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    if (!Array.isArray(messages) || messages.length > 20) {
      return res.status(400).json({ error: 'Demasiados mensajes en la conversación.' });
    }

    const contextSize = JSON.stringify(cardContext).length;
    if (contextSize > MAX_CONTEXT_BYTES) {
      return res.status(400).json({
        error: `El contexto de la carta es demasiado grande (${contextSize} bytes, máx ${MAX_CONTEXT_BYTES}).`,
      });
    }

    // Sanitise messages: keep only role + content, cap at 500 chars each.
    const sanitisedMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content || m.text || '').slice(0, 500),
      }));

    const apiKey = getServerOpenAiKey();
    if (!apiKey) {
      return res.status(503).json(serverAiUnavailable('El asistente LLM'));
    }

    // ── Build a tightly-scoped grounded system prompt ─────────────────────
    // We strip the full cardContext to only the fields the LLM needs, keeping
    // the payload small and preventing prompt injection via oversized context.
    const ctx = cardContext as Record<string, unknown>;
    const card = (ctx.card as Record<string, unknown>) ?? {};
    const groundedContext = {
      name: card.name,
      rarity: card.rarity,
      supertype: card.supertype,
      subtypes: card.subtypes,
      types: card.types,
      hp: card.hp,
      set: card.set,
      number: card.number,
      attacks: card.attacks,
      abilities: card.abilities,
      weaknesses: card.weaknesses,
      resistances: card.resistances,
      retreatCost: card.retreatCost,
      convertedRetreatCost: card.convertedRetreatCost,
      tcgplayer: card.tcgplayer,
      cardmarket: card.cardmarket,
      estimatedPrice: ctx.estimatedPrice,
      collectionMeta: ctx.collectionMeta,
      ownedCountInSet: ctx.ownedCountInSet,
      printedTotalInSet: ctx.printedTotalInSet,
    };

    const systemPrompt = `Eres el "Asistente de Carta" oficial de CardDex. Responde preguntas sobre la siguiente carta Pokémon TCG basándote ÚNICAMENTE en el contexto proporcionado.

INFORMACIÓN DE LA CARTA:
${JSON.stringify(groundedContext, null, 2)}

INSTRUCCIONES:
1. Responde en español, de forma clara y concisa (máx. 3 párrafos).
2. Usa **negritas** para resaltar datos importantes.
3. Si el usuario pregunta por precio, ataques, rareza o colección: usa SOLO los datos del contexto.
4. Si un dato no está en el contexto, dilo honestamente. NO inventes ni alucines datos.
5. No respondas preguntas no relacionadas con esta carta o el TCG Pokémon.`;

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...sanitisedMessages,
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: openAiMessages,
        max_tokens: 350,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      console.warn('[Card Assistant] OpenAI request failed.');
      return res.status(response.status).json({ error: 'Error del servicio de IA' });
    }

    const data = await response.json();
    return res.status(200).json({
      reply: data.choices[0].message.content.trim(),
      mode: 'server-llm',
    });
  } catch (error) {
    console.warn('[Card Assistant] Request failed.');
    return res.status(500).json({ error: 'Error interno en el servidor' });
  }
}
