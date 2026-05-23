/**
 * Premium telemetry and error observation client.
 * Traps runtime errors, unhandled rejections, and delivers them to the serverless logging API.
 */

interface ErrorPayload {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  context?: string;
  timestamp: string;
  url: string;
}

interface EventPayload {
  name: string;
  metadata?: any;
  timestamp: string;
  url: string;
}

let isInitialized = false;
const TELEMETRY_ENABLED = import.meta.env.VITE_TELEMETRY_MODE === 'server';

function safeUrl(): string {
  try {
    return `${window.location.origin}${window.location.pathname}`;
  } catch {
    return 'unknown';
  }
}

function safeText(value: unknown, max = 240): string {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/(sk-[A-Za-z0-9_-]+)/g, '[redacted-key]')
    .slice(0, max);
}

function safeMetadata(metadata: unknown): Record<string, string> | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>).slice(0, 8)) {
    out[safeText(key, 40)] = safeText(value, 120);
  }
  return out;
}

export function initTelemetry(): void {
  if (isInitialized || typeof window === 'undefined' || !TELEMETRY_ENABLED) return;

  // Unhandled standard runtime exceptions
  window.onerror = (message, source, lineno, colno, error) => {
    trackError(error || new Error(String(message)), 'window.onerror', {
      source: String(source),
      lineno,
      colno,
    });
    return false; // Let browser process it as well
  };

  // Unhandled promise rejections
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(JSON.stringify(reason));
    trackError(err, 'unhandledrejection');
  };

  isInitialized = true;
}

/**
 * Tracks an exception and sends it to the serverless logging endpoint.
 */
export function trackError(error: Error, context?: string, details?: Partial<ErrorPayload>): void {
  if (typeof window === 'undefined' || !TELEMETRY_ENABLED) return;

  const payload: ErrorPayload = {
    message: safeText(error.message || 'Unknown Error'),
    context: safeText(context || 'application', 80),
    timestamp: new Date().toISOString(),
    url: safeUrl(),
    ...details,
  };

  deliver('/api/telemetry', { type: 'error', data: payload });
}

/**
 * Tracks a custom telemetry event (e.g. scanning, deck optimization, passkey login success).
 */
export function trackEvent(name: string, metadata?: any): void {
  if (typeof window === 'undefined' || !TELEMETRY_ENABLED) return;

  const payload: EventPayload = {
    name: safeText(name, 80),
    metadata: safeMetadata(metadata),
    timestamp: new Date().toISOString(),
    url: safeUrl(),
  };

  deliver('/api/telemetry', { type: 'event', data: payload });
}

function deliver(url: string, body: any): void {
  try {
    const dataStr = JSON.stringify(body);

    if (navigator.sendBeacon) {
      const blob = new Blob([dataStr], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: dataStr,
        keepalive: true,
      }).catch(() => {});
    }
  } catch (e) {
    // Telemetry must never affect the app or leak details to logs.
  }
}
