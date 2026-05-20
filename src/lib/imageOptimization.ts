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

/**
 * Resizes an image file to a max dimension of 1000px on either side.
 * Returns a new File or the original if it is already small.
 */
export async function resizeImageFile(file: File, maxDim = 1000): Promise<File> {
  // If the file is smaller than 200KB, no need to resize
  if (file.size < 200 * 1024) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.width;
      const h = img.height;

      if (w <= maxDim && h <= maxDim) {
        resolve(file);
        return;
      }

      let targetW = w;
      let targetH = h;
      if (w > h) {
        targetW = maxDim;
        targetH = Math.round((h * maxDim) / w);
      } else {
        targetH = maxDim;
        targetW = Math.round((w * maxDim) / h);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(
            new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: file.lastModified,
            })
          );
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      resolve(file);
    };
    img.src = url;
  });
}

