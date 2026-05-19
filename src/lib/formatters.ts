/** Generic display formatters used across screens. */

export function formatInt(n: number): string {
  return new Intl.NumberFormat('es-ES').format(Math.round(n));
}

export function formatPercent(n: number, digits = 1): string {
  const fmt = new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return fmt.format(n / 100);
}

export function formatDateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Hash a string deterministically to a stable hue [0, 360).
 * Used as a fallback when an API icon is missing (e.g. set with no logo).
 */
export function stringHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) % 360;
  }
  return h;
}
