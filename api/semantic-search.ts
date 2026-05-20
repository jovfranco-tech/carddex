import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRateLimiter } from './_rateLimiter.js';

const limiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (!(await limiter.check(ip))) {
    return res.status(429).json({
      error: 'Demasiadas búsquedas. Espera un momento antes de continuar.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'El query es requerido' });
    }

    const safeQuery = String(query).slice(0, 500);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const systemPrompt = `Eres un motor de traducción de lenguaje natural a consultas estructuradas de Pokémon TCG API.
    Tu objetivo es transformar el término de búsqueda del usuario en un filtro Lucene oficial de la API de Pokémon TCG (https://pokemontcg.io).
    
    El formato Lucene esperado utiliza campos como:
    - name: e.g. name:"Charizard"
    - hp: e.g. hp:[150 TO *] o hp:120
    - types: e.g. types:"fire" (valores comunes: fire, water, lightning, grass, psychic, fighting, darkness, metal, dragon, colorless, fairy)
    - supertype: e.g. supertype:"trainer" o supertype:"pokemon"
    - rarity: e.g. rarity:"Rare Holo ex"
    - subtypes: e.g. subtypes:"stage 2" o subtypes:"basic" o subtypes:"supporter" o subtypes:"item"
    - rules: e.g. rules:"draw"
    
    Ejemplos de traducción:
    - "fuego con mas de 200 de vida" -> "types:fire AND hp:[200 TO *]"
    - "entrenadores partidarios de robo" -> "supertype:trainer AND subtypes:supporter AND rules:draw"
    - "cartas raras de pikachu" -> "name:Pikachu AND (rarity:\"Rare Holo\" OR rarity:\"Rare Holo ex\")"
    
    Retorna ÚNICAMENTE un objeto JSON estructurado con el siguiente formato exacto:
    {
      "luceneQuery": "la consulta estructurada final en formato Lucene",
      "explanation": "Breve explicación de los filtros aplicados (máx 15 palabras)",
      "highlightKeywords": ["palabras", "clave"]
    }
    
    No incluyas bloques de código ni texto adicional.`;

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
          { role: 'user', content: safeQuery }
        ],
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Semantic Search AI Error:', errorText);
      return res.status(response.status).json({ error: 'Error del motor de IA' });
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content.trim());

    return res.status(200).json(parsed);
  } catch (error) {
    console.error('Semantic Search API Error:', error);
    return res.status(500).json({ error: 'Error interno de búsqueda semántica' });
  }
}
