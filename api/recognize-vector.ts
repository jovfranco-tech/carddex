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

    // Simulate vector search latency (140ms-220ms)
    await new Promise((resolve) => setTimeout(resolve, 180));

    // Deterministic pool of mock vector cards to make the demo feel alive
    const mockVectorCards = [
      { cardName: 'Pikachu ex', number: '205/191', similarity: 0.9982 },
      { cardName: 'Charizard ex', number: '234/091', similarity: 0.9975 },
      { cardName: 'Mew ex', number: '205/165', similarity: 0.9989 },
      { cardName: 'Giratina VSTAR', number: '186/196', similarity: 0.9968 },
      { cardName: 'Lugia V', number: '186/195', similarity: 0.9971 }
    ];

    // Pick deterministically based on image length to be stable
    const index = image.length % mockVectorCards.length;
    const match = mockVectorCards[index];

    return res.status(200).json({
      ...match,
      vectorDimensions: 1536,
      processingTimeMs: 140,
      status: 'success'
    });
  } catch (error) {
    console.error('Vector Search Error:', error);
    return res.status(500).json({ error: 'Error interno en el servidor de búsqueda vectorial' });
  }
}
