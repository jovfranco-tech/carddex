/**
 * Lazy loader for OpenCV.js (WebAssembly) from CDN.
 * Prevents initial bundle bloat and initializes the library only when needed.
 */

let cvPromise: Promise<any> | null = null;

export function loadOpenCv(): Promise<any> {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('OpenCV can only be loaded in a browser environment.'));
      return;
    }

    // Already loaded
    if ((window as any).cv && (window as any).cv.Mat) {
      resolve((window as any).cv);
      return;
    }

    // Configure WebAssembly compilation callback
    (window as any).Module = {
      onRuntimeInitialized: () => {
        resolve((window as any).cv);
      },
    };

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.5.4/opencv.js';
    script.async = true;
    script.type = 'text/javascript';

    script.onload = () => {
      // Fallback polling check in case onRuntimeInitialized is skipped or races
      const checkInterval = setInterval(() => {
        if ((window as any).cv && (window as any).cv.Mat) {
          clearInterval(checkInterval);
          resolve((window as any).cv);
        }
      }, 100);

      // Clean up check after 15 seconds to prevent memory leaks
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 15000);
    };

    script.onerror = () => {
      cvPromise = null; // Allow retry on failure
      reject(new Error('Failed to load OpenCV.js from CDN.'));
    };

    document.body.appendChild(script);
  });

  return cvPromise;
}
