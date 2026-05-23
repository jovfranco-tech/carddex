export function getServerOpenAiKey(): string | null {
  if (process.env.ENABLE_SERVER_AI_FEATURES !== 'true') {
    return null;
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

export function serverAiUnavailable(feature: string) {
  return {
    error: `${feature} no está configurado en el servidor. Usa el modo demo/local de CardDex.`,
    mode: 'local-fallback',
  };
}
