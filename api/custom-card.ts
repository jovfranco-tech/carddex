import type { VercelRequest, VercelResponse } from './types.js';
import { createRateLimiter } from './_rateLimiter.js';
import { getServerOpenAiKey, serverAiUnavailable } from './_serverAi.js';

// Custom card generation is expensive (GPT + DALL-E): 5 req/min
const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (!(await limiter.check(ip))) {
    return res.status(429).json({
      error: 'Demasiadas solicitudes. Espera un momento antes de crear otra carta.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  try {
    const { name, type, style, artPrompt, cardA, cardB } = req.body;
    const isFusionMode = !!(cardA && cardB);
    if (!isFusionMode && (!name || !type)) {
      return res.status(400).json({ error: 'Missing name or type' });
    }

    // Sanitize inputs
    const safeName = isFusionMode ? `${String(cardA).slice(0, 30)} × ${String(cardB).slice(0, 30)}` : String(name).slice(0, 60);
    const safeType = String(type || 'Colorless').slice(0, 30);
    const safeStyle = String(style || 'Full Art').slice(0, 40);
    const safeArtPrompt = String(artPrompt || '').slice(0, 300);
    const safeCardA = String(cardA || '').slice(0, 60);
    const safeCardB = String(cardB || '').slice(0, 60);

    const apiKey = getServerOpenAiKey();
    if (!apiKey) {
      return res.status(503).json(serverAiUnavailable('El servicio LLM'));
    }

    // 1. Generate Card Stats using GPT
    const statsInstruction = isFusionMode
      ? `Eres un diseñador experto del juego de cartas coleccionables Pokémon TCG.
    Crea una carta FUSIÓN épica que combine dos Pokémon: "${safeCardA}" y "${safeCardB}".
    La carta fusionada debe:
    - Tener un nombre que combine ambos Pokémon (ej: "Charizard-Gengar", "MewTwo-Lucario")
    - Combinar los tipos de ambos Pokémon
    - Tener ataques que reflejen las habilidades características de ambos Pokémon originales
    - Tener estadísticas balanceadas y emocionantes

    Devuelve un objeto JSON con el siguiente formato exacto:
    {
      "hp": "220",
      "stage": "Basic",
      "fusionName": "Nombre de la fusión",
      "attack1": {
        "name": "Nombre del Ataque 1 (inspirado en ${safeCardA})",
        "cost": ["Energía1", "Energía2"],
        "damage": "80",
        "effect": "Efecto en español."
      },
      "attack2": {
        "name": "Nombre del Ataque 2 (fusión de ambos)",
        "cost": ["Energía1", "Energía2", "Energía3"],
        "damage": "180",
        "effect": "Efecto combinado épico en español."
      },
      "weakness": "Debilidad principal",
      "resistance": null,
      "retreatCost": 3,
      "description": "Descripción épica de la fusión en español."
    }
    Devuelve ÚNICAMENTE el objeto JSON sin marcas de Markdown.`
      : `Eres un diseñador experto del juego de cartas coleccionables Pokémon TCG.
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
        "cost": ["Energía1", "Energía2"],
        "damage": "60",
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
      "retreatCost": 2,
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
    const imagePrompt = isFusionMode
      ? `Epic Pokémon card fusion illustration combining ${safeCardA} and ${safeCardB} into a single epic hybrid creature. The creature should visually blend the most iconic features of both Pokémon. Full art style, dynamic pose, vivid colors, glowing energy effects, high detail digital art, suitable for a card frame.`
      : `Pokémon card illustration of ${safeName}, a ${safeType} type Pokémon, in ${safeStyle} style. ${safeArtPrompt || 'Vibrant colors, digital art, high quality, epic pokemon scene'}. Isolated artwork suitable for a card frame, high contrast, clean graphics.`;

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
        const tempUrl: string = dallData.data[0]?.url || '';
        if (tempUrl) {
          // Convert to permanent base64 data URL so it never expires
          try {
            const imgRes = await fetch(tempUrl);
            if (imgRes.ok) {
              const buffer = await imgRes.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              const mime = imgRes.headers.get('content-type') || 'image/png';
              imageUrl = `data:${mime};base64,${base64}`;
            } else {
              imageUrl = tempUrl; // fallback to temp url if download fails
            }
          } catch {
            imageUrl = tempUrl;
          }
        }
      } else {
        // Fall back to themed image.
      }
    } catch {
      // Fall back to themed image.
    }

    // Fallback image if DALL-E failed
    if (!imageUrl) {
      imageUrl = `https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=512&q=80`;
    }

    return res.status(200).json({
      ...stats,
      name: isFusionMode ? (stats.fusionName || safeName) : safeName,
      isFusion: isFusionMode,
      cardA: isFusionMode ? safeCardA : undefined,
      cardB: isFusionMode ? safeCardB : undefined,
      imageUrl,
    });
  } catch (error) {
    console.warn('[Custom Card] Request failed.');
    return res.status(500).json({ error: 'Error interno creando la carta custom con IA' });
  }
}
