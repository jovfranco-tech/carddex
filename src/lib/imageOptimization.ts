/**
 * Utility for client-side image compression and resizing using the free
 * images.weserv.nl service (powered by Cloudflare CDN).
 */
export function getOptimizedImageUrl(url: string | undefined, width?: number): string {
  if (!url) return '';
  
  // Only optimize official pokemontcg.io images to avoid breaking other services
  if (!url.startsWith('https://images.pokemontcg.io/')) {
    return url;
  }

  const cleanUrl = encodeURIComponent(url);
  // Scale width by 1.5 for crisp rendering on high-DPI/Retina screens
  const wParam = width ? `&w=${Math.round(width * 1.5)}` : '';
  
  // output=webp converts the format dynamically, q=80 sets optimal WebP compression
  return `https://images.weserv.nl/?url=${cleanUrl}${wParam}&output=webp&q=80`;
}
