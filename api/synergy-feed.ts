import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cards } = req.body;
    const cardListString = Array.isArray(cards) && cards.length > 0
      ? cards.slice(0, 15).join(', ')
      : 'ninguna (colección vacía)';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });
    }

    const systemPrompt = `Eres un estratega profesional de Pokémon TCG (Juego de Cartas Coleccionables).
    Analizas la colección del usuario y el meta actual para ofrecer consejos proactivos y combinaciones de cartas recomendadas.
    
    Cartas en la colección del usuario: [${cardListString}]
    
    Genera un listado de exactamente 3 consejos o sinergias estratégicas basadas en estas cartas. Si el usuario no tiene cartas, asume que está interesado en el meta competitivo actual (como Charizard ex, Gardevoir ex, Dragapult ex, etc.).
    
    Devuelve estrictamente un objeto JSON con la estructura:
    {
      "synergies": [
        {
          "title": "Título llamativo de la sinergia (ej: 'El combo del buscador rápido')",
          "cardsInvolved": "Nombres de cartas involucradas (ej: 'Pidgeot ex + Charizard ex')",
          "tag": "Categoría (ej: 'Consistencia', 'Ataque', 'Control', 'Energía')",
          "explanation": "Explicación detallada en español de cómo interactúan estas cartas y por qué es una buena estrategia.",
          "recommendation": "Carta externa recomendada para añadir (ej: 'Agregar 2 copias de Ultra Ball')"
        }
      ]
    }
    
    Devuelve ÚNICAMENTE el objeto JSON sin formato markdown.`;

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: systemPrompt }],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!gptResponse.ok) {
      throw new Error('Error al conectar con OpenAI');
    }

    const gptData = await gptResponse.json();
    const gptText = gptData.choices[0].message.content.trim();
    const result = JSON.parse(gptText);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Synergy Feed API error:', error);
    return res.status(500).json({ error: 'Error interno en el feed de sinergias' });
  }
}
