import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRateLimiter } from './_rateLimiter.js';

// Custom card generation is expensive (GPT + DALL-E): 5 req/min
const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (!limiter.check(ip)) {
    return res.status(429).json({
      error: 'Demasiadas solicitudes. Espera un momento antes de crear otra carta.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  try {
    const { name, type, style, artPrompt } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Missing name or type' });
    }

    // Sanitize inputs
    const safeName = String(name).slice(0, 60);
    const safeType = String(type).slice(0, 30);
    const safeStyle = String(style || 'Full Art').slice(0, 40);
    const safeArtPrompt = String(artPrompt || '').slice(0, 300);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    // 1. Generate Card Stats using GPT
    const statsInstruction = `Eres un diseñador experto del juego de cartas coleccionables Pokémon TCG.
    Crea estadísticas balanceadas y divertidas para una carta de Pokémon personalizada con las siguientes especificaciones:
    - Nombre del Pokémon: "${safeName}"
    - Tipo: "${safeType}"
    - Estilo/Estética: "${safeStyle}"

    Devuelve un objeto JSON con el siguiente formato exacto:
    {
      "hp": "180",
      "stage": "Basic" o "Stage 1" o "Stage 2",
      "attack1": {
        "name": "Nombre del Ataque 1",
        "cost": ["Energía1", "Energía2"], // Ej: ["Fire", "Colorless"]
        "damage": "60", // Puede tener símbolos +, - o x si aplica
        "effect": "Efecto o descripción del ataque 1 en español."
      },
      "attack2": {
        "name": "Nombre del Ataque 2",
        "cost": ["Energía1", "Energía2", "Energía3"],
        "damage": "150",
        "effect": "Efecto o descripción del ataque 2 en español."
      },
      "weakness": "Debilidad (ej: Water)",
      "resistance": "Resistencia (ej: Fighting o null)",
      "retreatCost": 2, // Número de energías para retirar
      "description": "Una frase poética o descripción de Pokédex en español sobre este Pokémon."
    }

    Devuelve ÚNICAMENTE el objeto JSON sin marcas de Markdown.`;

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: statsInstruction }],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!gptResponse.ok) {
      throw new Error('Error al generar las estadísticas de la carta');
    }

    const gptData = await gptResponse.json();
    const gptText = gptData.choices[0].message.content.trim();
    const stats = JSON.parse(gptText);

    // 2. Generate Artwork using DALL-E
    const imagePrompt = `Pokémon card illustration of ${safeName}, a ${safeType} type Pokémon, in ${safeStyle} style. ${safeArtPrompt || 'Vibrant colors, digital art, high quality, epic pokemon scene'}. Isolated artwork suitable for a card frame, high contrast, clean graphics.`;

    let imageUrl = '';
    try {
      const dallResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-2',
          prompt: imagePrompt,
          n: 1,
          size: '512x512',
        }),
      });

      if (dallResponse.ok) {
        const dallData = await dallResponse.json();
        imageUrl = dallData.data[0]?.url || '';
      } else {
        console.warn('DALL-E image generation failed, falling back to themed image.');
      }
    } catch (e) {
      console.error('Error generating image via DALL-E:', e);
    }

    // Fallback image if DALL-E failed
    if (!imageUrl) {
      imageUrl = `https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=512&q=80`;
    }

    return res.status(200).json({
      ...stats,
      imageUrl,
    });
  } catch (error) {
    console.error('Custom Card creation error:', error);
    return res.status(500).json({ error: 'Error interno creando la carta custom con IA' });
  }
}
