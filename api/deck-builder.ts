import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRateLimiter } from './_rateLimiter.js';

const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (!(await limiter.check(ip))) {
    return res.status(429).json({
      error: 'Demasiadas solicitudes. Espera un momento antes de construir otro mazo.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'El prompt es requerido' });
    }

    const safePrompt = String(prompt).slice(0, 500);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
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
    3. Asegura sinergias competitivas (por ejemplo, si agregas Charizard ex de Obsidian Flames, incluye Charmander, Charmeleon, Rare Candy, Pidgeot ex, Buddy-Buddy Poffin, etc.).
    4. Usa nombres oficiales exactos en inglés (ej. "Charmander", "Ultra Ball", "Super Rod", "Arven", "Iono", "Nest Ball").
    5. Retorna ÚNICAMENTE el objeto JSON puro sin bloques de código Markdown (\`\`\`).`;

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
          { role: 'user', content: safePrompt }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Deck Builder Error:', errorText);
      return res.status(response.status).json({ error: 'Error al contactar al servicio de IA' });
    }

    const data = await response.json();
    const resultText = data.choices[0].message.content.trim();

    let parsedResult;
    try {
      parsedResult = JSON.parse(resultText);
    } catch {
      return res.status(500).json({ error: 'Error al procesar el formato de respuesta del mazo' });
    }

    return res.status(200).json(parsedResult);
  } catch (error) {
    console.error('Deck Builder API Error:', error);
    return res.status(500).json({ error: 'Error interno en el servidor' });
  }
}
