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
    const systemPrompt = `Eres el asistente oficial de "CardDex", una aplicación para gestionar colecciones de cartas de Pokémon TCG.
    El usuario te está haciendo una pregunta sobre su colección o sobre Pokémon TCG en general.
    Responde SIEMPRE de forma concisa, amigable, y en un tono entusiasta de entrenador Pokémon.
    
    ESTADO ACTUAL DE LA COLECCIÓN DEL USUARIO:
    ${collectionStats ? JSON.stringify(collectionStats) : 'Desconocido'}
    
    No des explicaciones técnicas innecesarias ni hables sobre ti mismo como una IA a menos que sea muy necesario. Mantén tus respuestas breves, máximo 2 o 3 párrafos cortos. No inventes datos.`;

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
