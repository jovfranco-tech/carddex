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
            content: 'Eres un experto en Pokémon TCG. Analiza la imagen de la carta proporcionada. Si la carta está en un idioma distinto al inglés (ej. japonés, español), traduce e identifica la versión oficial equivalente en inglés para que coincida con la base de datos occidental de Pokémon TCG.\n\nDevuelve ÚNICAMENTE un objeto JSON con las siguientes claves:\n- "cardName": Nombre oficial de la carta traducido al inglés (ej. "Charizard", "Boss\'s Orders").\n- "number": El número de la carta tal cual viene impreso en la carta física (ej. "026/071" o "4/102").\n- "language": El código de idioma detectado (ej. "JP", "EN", "ES", "FR", etc.).\n- "englishNumber": El número equivalente de la carta en la versión en inglés si es una carta no inglesa (ej. para cartas japonesas, "062/193" o "62"). Si es inglés o no lo sabes, pon null.\n- "englishSetHint": El nombre del set equivalente en inglés (ej. "Paldea Evolved", "Crown Zenith", "Scarlet & Violet"). Si es inglés o no lo sabes, pon null.\n\nNo incluyas markdown (como ```json), solo el JSON raw puro y válido.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: image,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 250,
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
