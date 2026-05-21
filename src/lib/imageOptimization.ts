/**
 * Utility for client-side image compression, resizing, and automatic card cropping.
 * Uses contrast-based edge detection to remove background clutter before AI processing.
 * Also integrates the free images.weserv.nl service for rendering.
 */

export function getOptimizedImageUrl(url: string | undefined, width?: number): string {
  if (!url) return '';
  return url;
}

/**
 * Resizes an image file to a max dimension of 1000px on either side.
 * Returns a new File or the original if it is already small.
 */
export async function resizeImageFile(file: File, maxDim = 1000): Promise<File> {
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

/**
 * Detects the bounding box of a card within the canvas by analyzing pixel color contrast.
 * Scans inwards from top, bottom, left, and right to find high-gradient transitions
 * (representing card edges against standard backgrounds like tables, desks, etc.).
 * Returns the cropped bounding box, adding margin to keep borders intact.
 */
export function detectCardBoundingBox(canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { x: 0, y: 0, w: canvas.width, h: canvas.height };

  const { width: w, height: h } = canvas;
  let data: Uint8ClampedArray;
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    data = imgData.data;
  } catch (e) {
    // Cross-origin fallback
    return { x: 0, y: 0, w, h };
  }

  // Helper to get RGB at coordinate
  const getRGB = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  };

  // Helper to calculate Euclidean color distance in RGB space
  const colorDistance = (c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }) => {
    return Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
  };

  // Define background reference by averaging regions near corners
  const corners = [getRGB(5, 5), getRGB(w - 5, 5), getRGB(5, h - 5), getRGB(w - 5, h - 5)];
  const bg = {
    r: Math.round(corners.reduce((sum, c) => sum + c.r, 0) / 4),
    g: Math.round(corners.reduce((sum, c) => sum + c.g, 0) / 4),
    b: Math.round(corners.reduce((sum, c) => sum + c.b, 0) / 4)
  };

  let top = 0;
  let bottom = h - 1;
  let left = 0;
  let right = w - 1;

  const THRESHOLD = 38; 
  const GRID_STEP = 6;

  // 1. Scan Top to Bottom (sample columns at 25%, 50%, 75% width)
  let foundTop = false;
  for (let y = 10; y < h / 2; y += GRID_STEP) {
    let contrastHits = 0;
    const cols = [Math.round(w * 0.25), Math.round(w * 0.5), Math.round(w * 0.75)];
    for (const col of cols) {
      if (colorDistance(getRGB(col, y), bg) > THRESHOLD) contrastHits++;
    }
    if (contrastHits >= 2) {
      top = Math.max(0, y - 12);
      foundTop = true;
      break;
    }
  }

  // 2. Scan Bottom to Top
  let foundBottom = false;
  for (let y = h - 10; y > h / 2; y -= GRID_STEP) {
    let contrastHits = 0;
    const cols = [Math.round(w * 0.25), Math.round(w * 0.5), Math.round(w * 0.75)];
    for (const col of cols) {
      if (colorDistance(getRGB(col, y), bg) > THRESHOLD) contrastHits++;
    }
    if (contrastHits >= 2) {
      bottom = Math.min(h - 1, y + 12);
      foundBottom = true;
      break;
    }
  }

  // 3. Scan Left to Right (sample rows at 25%, 50%, 75% height)
  let foundLeft = false;
  for (let x = 10; x < w / 2; x += GRID_STEP) {
    let contrastHits = 0;
    const rows = [Math.round(h * 0.25), Math.round(h * 0.5), Math.round(h * 0.75)];
    for (const row of rows) {
      if (colorDistance(getRGB(x, row), bg) > THRESHOLD) contrastHits++;
    }
    if (contrastHits >= 2) {
      left = Math.max(0, x - 12);
      foundLeft = true;
      break;
    }
  }

  // 4. Scan Right to Left
  let foundRight = false;
  for (let x = w - 10; x > w / 2; x -= GRID_STEP) {
    let contrastHits = 0;
    const rows = [Math.round(h * 0.25), Math.round(h * 0.5), Math.round(h * 0.75)];
    for (const row of rows) {
      if (colorDistance(getRGB(x, row), bg) > THRESHOLD) contrastHits++;
    }
    if (contrastHits >= 2) {
      right = Math.min(w - 1, x + 12);
      foundRight = true;
      break;
    }
  }

  // Fallback if boundaries are too ambiguous
  if (!foundTop || !foundBottom || !foundLeft || !foundRight) {
    const pW = Math.round(w * 0.04);
    const pH = Math.round(h * 0.04);
    return { x: pW, y: pH, w: w - pW * 2, h: h - pH * 2 };
  }

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top
  };
}

/**
 * Compresses and auto-crops a base64-encoded image to a target size
 * in KB before sending it to an AI endpoint.
 */
export async function compressForAI(base64: string, maxKB = 500): Promise<string> {
  return new Promise<string>((resolve) => {
    const img = new Image();
    const src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    img.onload = () => {
      const MAX_DIM = 1600;
      let { width: w, height: h } = img;

      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round((h * MAX_DIM) / w); w = MAX_DIM; }
        else { w = Math.round((w * MAX_DIM) / h); h = MAX_DIM; }
      }

      // 1. Initial draw to temp canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) { resolve(base64); return; }
      tempCtx.drawImage(img, 0, 0, w, h);

      // 2. Perform intelligent card cropping to remove background
      const crop = detectCardBoundingBox(tempCanvas);

      // 3. Draw cropped region to final canvas
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = crop.w;
      finalCanvas.height = crop.h;
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) { resolve(base64); return; }
      finalCtx.drawImage(tempCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

      // 4. Compress to target file size
      const tryEncode = (quality: number) => {
        const dataUrl = finalCanvas.toDataURL('image/jpeg', quality);
        const approxKB = (dataUrl.length * 0.75) / 1024;
        if (approxKB <= maxKB || quality <= 0.5) {
          resolve(dataUrl);
        } else {
          tryEncode(quality - 0.12);
        }
      };

      tryEncode(0.82);
    };
    img.onerror = () => resolve(base64);
    img.src = src;
  });
}
