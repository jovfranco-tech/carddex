import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, collectionStats } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Formato de mensajes inválido' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    // Build the system prompt using the user's actual collection stats
    const systemPrompt = `Eres el asistente oficial de "CardDex", una aplicación para gestionar colecciones y mazos de Pokémon TCG.
    El usuario te está haciendo una pregunta sobre su carta, Pokémon TCG en general, o solicita la optimización de un mazo completo.
    Eres un MAESTRO ESTRATEGA de Pokémon TCG. Puedes sugerir sinergias, combos, evaluar proporciones de Pokémon, Entrenadores y Energías, e indicar qué cartas convendría agregar o quitar.
    Si estás analizando un mazo:
    - Analiza críticamente si la composición tiene sentido (ej: demasiadas energías, pocos entrenadores de soporte/búsqueda).
    - Sugiere sinergias específicas basadas en las habilidades y ataques de las cartas provistas.
    - Sé directo, estructurado y constructivo. Usa listas de viñetas, títulos y negritas para mejorar la legibilidad.
    - Proporciona recomendaciones concretas de cartas reales de Pokémon TCG.
    
    ESTADO ACTUAL DE LA COLECCIÓN / MAZO DEL USUARIO:
    ${collectionStats ? JSON.stringify(collectionStats) : 'Desconocido'}
    
    Responde de forma amigable y en un tono entusiasta de entrenador Pokémon. No des explicaciones técnicas de programación.`;

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
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
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Chat Error:', errorText);
      return res.status(response.status).json({ error: 'Error del servicio de IA' });
    }

    const data = await response.json();
    return res.status(200).json({
      reply: data.choices[0].message.content.trim()
    });
  } catch (error) {
    console.error('Chat AI Error:', error);
    return res.status(500).json({ error: 'Error interno en el servidor de chat' });
  }
}
