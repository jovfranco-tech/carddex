export function getServerAiKey(): string | null {
  if (process.env.ENABLE_SERVER_AI_FEATURES !== 'true') {
    return null;
  }

  const key = (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)?.trim();
  return key || null;
}

export function getServerAiEndpoint(): string {
  if (process.env.GEMINI_API_KEY) {
    return 'https://generativelanguage.googleapis.com/v1beta/openai';
  }
  return 'https://api.openai.com/v1';
}

export function mapModel(model: string): string {
  if (process.env.GEMINI_API_KEY) {
    if (model === 'gpt-4o' || model === 'gpt-4') {
      return 'gemini-1.5-pro';
    }
    return 'gemini-1.5-flash';
  }
  return model;
}

/** Keep backwards compatibility alias */
export function getServerOpenAiKey(): string | null {
  return getServerAiKey();
}

export function serverAiUnavailable(feature: string) {
  return {
    error: `${feature} no está configurado en el servidor. Usa el modo demo/local de CardDex.`,
    mode: 'local-fallback',
  };
}
