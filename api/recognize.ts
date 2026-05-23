import type { VercelRequest, VercelResponse } from './types.js';
import { createRateLimiter } from './_rateLimiter.js';
import { getServerOpenAiKey, serverAiUnavailable } from './_serverAi.js';

const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
const MAX_IMAGE_CHARS = 6_700_000;

let setsCache: string = '';
let cacheExpiry = 0;

async function getSetListContext(): Promise<string> {
  const now = Date.now();
  if (setsCache && now < cacheExpiry) {
    return setsCache;
  }

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = process.env.POKEMON_TCG_API_KEY;
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    // Usamos AbortSignal.timeout para evitar que la función serverless se quede colgada
    const res = await fetch('https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=120', {
      headers,
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(3000) : undefined,
    });

    if (res.ok) {
      const data = await res.json();
      const sets = data.data || [];
      const lines = sets.map((s: any) => 
        `- ${s.name} (ID: ${s.id}, Series: ${s.series}, Printed Total: ${s.printedTotal}, Release: ${s.releaseDate})`
      );
      setsCache = lines.join('\n');
      cacheExpiry = now + 4 * 3600 * 1000; // Cache por 4 horas
      return setsCache;
    }
  } catch {
    console.warn('[OCR] Failed to fetch set context for recognition.');
  }

  // Fallback si la petición falla o tarda demasiado
  return `
- Perfect Order (ID: me3, Series: Mega Evolution, Printed Total: 88, Release: 2026/03/27)
- Ascended Heroes (ID: me2pt5, Series: Mega Evolution, Printed Total: 217, Release: 2026/01/30)
- Phantasmal Flames (ID: me2, Series: Mega Evolution, Printed Total: 94, Release: 2025/11/14)
- Mega Evolution (ID: me1, Series: Mega Evolution, Printed Total: 132, Release: 2025/09/26)
- Black Bolt (ID: zsv10pt5, Series: Scarlet & Violet, Printed Total: 86, Release: 2025/07/18)
- White Flare (ID: rsv10pt5, Series: Scarlet & Violet, Printed Total: 86, Release: 2025/07/18)
- Destined Rivals (ID: sv10, Series: Scarlet & Violet, Printed Total: 182, Release: 2025/05/30)
- Journey Together (ID: sv9, Series: Scarlet & Violet, Printed Total: 159, Release: 2025/03/28)
- Prismatic Evolutions (ID: sv8pt5, Series: Scarlet & Violet, Printed Total: 131, Release: 2025/01/17)
- Surging Sparks (ID: sv8, Series: Scarlet & Violet, Printed Total: 191, Release: 2024/11/08)
- Stellar Crown (ID: sv7, Series: Scarlet & Violet, Printed Total: 142, Release: 2024/09/13)
- Twilight Masquerade (ID: sv6, Series: Scarlet & Violet, Printed Total: 167, Release: 2024/05/24)
- Temporal Forces (ID: sv5, Series: Scarlet & Violet, Printed Total: 162, Release: 2024/03/22)
- Paldean Fates (ID: sv4pt5, Series: Scarlet & Violet, Printed Total: 91, Release: 2024/01/26)
- Paradox Rift (ID: sv4, Series: Scarlet & Violet, Printed Total: 182, Release: 2023/11/03)
- 151 (ID: sv3pt5, Series: Scarlet & Violet, Printed Total: 165, Release: 2023/09/22)
- Obsidian Flames (ID: sv3, Series: Scarlet & Violet, Printed Total: 197, Release: 2023/08/11)
- Paldea Evolved (ID: sv2, Series: Scarlet & Violet, Printed Total: 193, Release: 2023/06/09)
- Scarlet & Violet (ID: sv1, Series: Scarlet & Violet, Printed Total: 198, Release: 2023/03/31)
  `;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!(await limiter.check(ip))) {
    return res.status(429).json({
      error: 'Demasiados escaneos. Espera un momento antes de intentarlo de nuevo.',
      retryAfter: limiter.retryAfter(ip),
    });
  }

  try {
    const { image, languageHint } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No image provided' });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return res.status(413).json({ error: 'La imagen es demasiado grande (máximo 5 MB).' });
    }
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'El OCR de servidor sólo acepta capturas locales en formato data URL.' });
    }

    const apiKey = getServerOpenAiKey();
    if (!apiKey) {
      return res.status(503).json(serverAiUnavailable('El OCR de servidor'));
    }

    const setListContext = await getSetListContext();

    let systemInstruction = 'Eres un experto en Pokémon TCG. Analiza la imagen de la carta proporcionada. Si la carta está en un idioma distinto al inglés (ej. japonés, español), traduce e identifica la versión oficial equivalente en inglés para que coincida con la base de datos occidental de Pokémon TCG.\n\n' +
      'Para ayudarte a identificar el set correcto, aquí tienes la lista de los sets oficiales recientes en inglés de la base de datos. Úsala para relacionar el logotipo/símbolo de set de la carta física o el código de set impreso en el borde inferior con el ID de set correspondiente en inglés:\n' +
      setListContext + '\n\n' +
      'Instrucciones de extracción:\n' +
      '1. Si la carta física es en español, francés, italiano u otro idioma occidental, su número de carta impreso y el set son exactamente iguales al inglés, solo traduce el nombre de la carta al inglés.\n' +
      '2. Si la carta es en japonés, intenta deducir la carta correspondiente en inglés. Si conoces el set y el número equivalente en inglés, devuélvelos. Si no conoces el número equivalente exacto de la carta japonesa en inglés, pon null en "englishNumber" pero pon el set equivalente correcto en "englishSetHint" (usando el nombre de set o ID de la lista anterior).\n' +
      '3. En "englishSetHint", proporciona el nombre del set en inglés o el ID del set de la lista anterior (ej. "Journey Together", "sv9", "me3"). Si es inglés o no lo sabes, pon null.\n\n' +
      'Devuelve ÚNICAMENTE un objeto JSON con las siguientes claves:\n' +
      '- "cardName": Nombre oficial de la carta traducido al inglés (ej. "Charizard ex", "Mewtwo ex", "Boss\'s Orders").\n' +
      '- "number": El número de la carta tal cual viene impreso en la carta física (ej. "026/071" o "4/102").\n' +
      '- "language": El código de idioma detectado (ej. "JP", "EN", "ES", "FR", etc.).\n' +
      '- "englishNumber": El número equivalente de la carta en la versión en inglés si es una carta no inglesa (ej. para cartas japonesas, "062/193" o "62"). Si es inglés o no lo sabes, pon null.\n' +
      '- "englishSetHint": El nombre del set equivalente en inglés o su ID (ej. "Journey Together", "sv9", "me3"). Si es inglés o no lo sabes, pon null.\n\n' +
      'No incluyas markdown (como ```json), solo el JSON raw puro y válido.';

    const safeLanguageHint = ['EN', 'ES', 'JP', 'AUTO'].includes(String(languageHint))
      ? String(languageHint)
      : 'AUTO';
    if (safeLanguageHint !== 'AUTO') {
      systemInstruction += `\n\n[CONTEXTO DE IDIOMA]: El usuario ha indicado que la carta física está en el idioma: "${safeLanguageHint}". Usa esta información de contexto de manera activa para guiar tu OCR y corregir falsas transcripciones visuales de caracteres.`;
    }

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
          {
            role: 'system',
            content: systemInstruction,
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
      await response.text().catch(() => '');
      console.warn('[OCR] OpenAI recognition request failed.');
      return res.status(response.status).json({ error: 'Error del servicio de IA' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Extraer el bloque JSON usando una expresión regular robusta
    let cleanJson = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanJson = jsonMatch[0];
    }
    const parsed = JSON.parse(cleanJson);

    return res.status(200).json(parsed);
  } catch (error) {
    console.warn('[OCR] Server recognition failed.');
    return res.status(500).json({ error: 'Error interno en el servidor OCR' });
  }
}
