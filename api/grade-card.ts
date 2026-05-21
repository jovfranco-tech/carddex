import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRateLimiter } from './_rateLimiter.js';

const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

// Max image size: 5MB in base64 chars (~6.67M chars for 5MB binary)
const MAX_IMAGE_CHARS = 6_700_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (!(await limiter.check(ip))) {
    return res.status(429).json({
      error: 'Demasiadas solicitudes. Espera un momento antes de intentarlo de nuevo.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Validate image size to avoid runaway token costs
    if (typeof image === 'string' && image.length > MAX_IMAGE_CHARS) {
      return res.status(413).json({ error: 'La imagen es demasiado grande (máximo 5 MB).' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el servidor' });
    }

    const systemInstruction = `Eres un evaluador profesional certificado de cartas de Pokémon TCG (como PSA, Beckett, o CGC).
    Analiza la imagen de la carta física y simula una evaluación del estado de conservación física.
    Inspecciona y calcula los sub-puntajes de 1.0 a 10.0 (en incrementos de 0.5) para:
    1. Centering (Centrado): alineación de los bordes.
    2. Corners (Esquinas): desgaste de esquinas, blanqueamiento.
    3. Edges (Bordes): desgaste de bordes, golpes.
    4. Surface (Superficie): rayones, dobleces, marcas.

    Calcula la calificación general como el promedio de los sub-puntajes (redondeado a la mitad más cercana).
    Determina un "qualifier" basado en la nota general:
    - 10: Gem Mint / Pristine
    - 9.0 - 9.5: Mint
    - 8.0 - 8.5: Near Mint-Mint
    - 7.0 - 7.5: Near Mint
    - 6.0 - 6.5: Excellent-Mint
    - 5.0 - 5.5: Excellent
    - 4.0 - 4.5: Very Good
    - 3.0 - 3.5: Good
    - 1.0 - 2.5: Poor / Played

    Además, evalúa la VIABILIDAD COMPETITIVA TCG de la carta identificada:
    - metaScore: número de 1.0 a 10.0 que representa qué tan competitiva es esta carta en el meta actual del formato Estándar de Pokémon TCG (Scarlet & Violet).
    - metaViability: una de estas opciones: "Alta", "Media", "Baja", "Irrelevante".
    - metaAnalysis: párrafo de 1-2 oraciones en español explicando por qué esta carta es o no competitiva actualmente (menciona arquetipos, mecánicas, sinergias si aplica).

    El JSON final debe incluir el campo "metaRating" con los tres sub-campos.

    Devuelve un JSON con el siguiente formato exacto:
    {
      "cardName": "Charizard ex",
      "centering": 9.5,
      "corners": 8.0,
      "edges": 9.0,
      "surface": 9.5,
      "overallGrade": 9.0,
      "qualifier": "Mint",
      "issues": [
        "Desgaste leve blanco en la esquina trasera superior derecha",
        "El centrado está ligeramente desplazado a la izquierda (60/40)"
      ],
      "metaRating": {
        "metaScore": 8.5,
        "metaViability": "Alta",
        "metaAnalysis": "Charizard ex domina el formato Estándar con el arquetipo Charizard/Pidgeot. Excelente carta de inversión."
      }
    }

    No incluyas bloques de código Markdown ni texto adicional. Solo el objeto JSON limpio.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
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
        max_tokens: 550,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Grade Card API Error:', errorText);
      return res.status(response.status).json({ error: 'Error del motor de evaluación' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(500).json({ error: 'Error al parsear el resultado de la evaluación' });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    console.error('Grade Card handler error:', error);
    return res.status(500).json({ error: 'Error interno en el servidor de evaluación' });
  }
}
