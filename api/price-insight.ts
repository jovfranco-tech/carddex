import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRateLimiter } from './_rateLimiter.js';

const limiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

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

  const { cardName, oldPrice, newPrice, changePercent } = req.body;
  if (!cardName || oldPrice === undefined || newPrice === undefined || changePercent === undefined) {
    return res.status(400).json({ error: 'cardName, oldPrice, newPrice y changePercent son requeridos' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
  }

  const safeCardName = String(cardName).slice(0, 80);
  const safeOldPrice = Number(oldPrice).toFixed(2);
  const safeNewPrice = Number(newPrice).toFixed(2);
  const safeChangePercent = Number(changePercent).toFixed(1);
  const direction = Number(changePercent) > 0 ? 'subió' : 'bajó';

  const systemPrompt = `Eres un analista experto del mercado de cartas Pokémon TCG coleccionables. 
Tu rol es explicar en 2-3 oraciones en español, de forma inteligente y conversacional, POR QUÉ podría haber cambiado el precio de una carta específica.

Basate en factores reales del meta-juego Pokémon TCG:
- Resultados de torneos recientes (Regionales, Internacionales, Mundiales)
- Cambios en el formato estándar o rotaciones
- Popularidad de arquetipos de mazo que usen esa carta
- Rareza, reimpresiones o carta próxima a rotar del formato
- Demanda especulativa por nuevo set o expansión
- Tendencias de la comunidad coleccionista (arte especial, full art, etc.)

IMPORTANTE: Sé específico y menciona factores PLAUSIBLES para esa carta en particular. No uses frases genéricas. Habla como un experto del mercado TCG que conoce el meta actual de Scarlet & Violet.`;

  const userPrompt = `La carta "${safeCardName}" ${direction} su precio de $${safeOldPrice} a $${safeNewPrice} USD (${safeChangePercent > '0' ? '+' : ''}${safeChangePercent}%).

¿Por qué crees que ocurrió este cambio de precio?`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.75,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Price Insight API Error:', errorText);
      return res.status(response.status).json({ error: 'Error del motor de análisis de precios' });
    }

    const data = await response.json();
    const insight = data.choices[0].message.content.trim();

    return res.status(200).json({ insight });
  } catch (error) {
    console.error('Price Insight handler error:', error);
    return res.status(500).json({ error: 'Error interno en el servidor de análisis' });
  }
}
