import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en Pokémon TCG. Analiza la imagen de la carta proporcionada. Si la carta está en un idioma distinto al inglés (ej. japonés), TRADUCE el nombre al INGLÉS para que coincida con la base de datos oficial. Devuelve ÚNICAMENTE un objeto JSON con el nombre del Pokémon en "cardName", el número de la carta impreso (ej. "4/102") en "number", y el idioma detectado ("JP", "EN", "ES", etc) en "language". No incluyas markdown, solo el JSON raw.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: image,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Error:', errorText);
      return res.status(response.status).json({ error: 'Error del servicio de IA' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Si viene con formato markdown (```json ... ```), lo limpiamos
    const cleanJson = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleanJson);

    return res.status(200).json(parsed);
  } catch (error) {
    console.error('OCR Error:', error);
    return res.status(500).json({ error: 'Error interno en el servidor OCR' });
  }
}
