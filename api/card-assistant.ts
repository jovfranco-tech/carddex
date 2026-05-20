import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, cardContext } = req.body;
    if (!messages || !Array.isArray(messages) || !cardContext) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const systemPrompt = `Eres el "Asistente de Carta" oficial de CardDex. Tu objetivo es responder preguntas del usuario sobre la siguiente carta de Pokémon TCG de manera precisa y basándote ÚNICAMENTE en el contexto proporcionado.
    
    INFORMACIÓN DE LA CARTA (CONTEXTO):
    ${JSON.stringify(cardContext)}
    
    INSTRUCCIONES DE RESPUESTA:
    1. Responde de forma clara y directa en español.
    2. Utiliza negritas y markdown para que la respuesta sea legible.
    3. Si el usuario te pregunta por precios, disponibilidad, ataques, habilidades, debilidades, coste de retirada, o si la tiene en su colección, utiliza los datos del CONTEXTO como la verdad absoluta.
    4. Si un dato no está en el CONTEXTO (por ejemplo, el precio es null o la rareza no se indica), dilo de forma honesta ("No dispongo de esa información en los datos de la carta"). No inventes ni alucines datos.
    5. Sé conciso y amigable.`;

    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || m.text
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
        max_tokens: 300,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Card Assistant Error:', errorText);
      return res.status(response.status).json({ error: 'Error del servicio de IA' });
    }

    const data = await response.json();
    return res.status(200).json({
      reply: data.choices[0].message.content.trim()
    });
  } catch (error) {
    console.error('Card Assistant API Error:', error);
    return res.status(500).json({ error: 'Error interno en el servidor' });
  }
}
