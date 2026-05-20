/**
 * Premium telemetry and error observation client.
 * Traps runtime errors, unhandled rejections, and delivers them to the serverless logging API.
 */

interface ErrorPayload {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  context?: string;
  timestamp: string;
  userAgent: string;
  url: string;
}

interface EventPayload {
  name: string;
  metadata?: any;
  timestamp: string;
  url: string;
}

let isInitialized = false;

export function initTelemetry(): void {
  if (isInitialized || typeof window === 'undefined') return;

  // Unhandled standard runtime exceptions
  window.onerror = (message, source, lineno, colno, error) => {
    trackError(
      error || new Error(String(message)),
      'window.onerror',
      {
        source: String(source),
        lineno,
        colno
      }
    );
    return false; // Let browser process it as well
  };

  // Unhandled promise rejections
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(JSON.stringify(reason));
    trackError(err, 'unhandledrejection');
  };

  isInitialized = true;
  console.log('[Telemetry] Active & Observing runtime exceptions.');
}

/**
 * Tracks an exception and sends it to the serverless logging endpoint.
 */
export function trackError(error: Error, context?: string, details?: Partial<ErrorPayload>): void {
  if (typeof window === 'undefined') return;

  const payload: ErrorPayload = {
    message: error.message || 'Unknown Error',
    stack: error.stack,
    context: context || 'application',
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    ...details
  };

  deliver('/api/telemetry', { type: 'error', data: payload });
}

/**
 * Tracks a custom telemetry event (e.g. scanning, deck optimization, passkey login success).
 */
export function trackEvent(name: string, metadata?: any): void {
  if (typeof window === 'undefined') return;

  const payload: EventPayload = {
    name,
    metadata,
    timestamp: new Date().toISOString(),
    url: window.location.href
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
        keepalive: true
      }).catch(err => console.warn('[Telemetry] Delivery failed:', err));
    }
  } catch (e) {
    console.error('[Telemetry] Send error:', e);
  }
}
