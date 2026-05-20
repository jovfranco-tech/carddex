import React, { useRef, useEffect } from 'react';

interface EdgeDetectorCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
}

export default function EdgeDetectorCanvas({ videoRef, active }: EdgeDetectorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active || !videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    const width = 160;
    const height = 240;

    // Offscreen canvas for fast image processing
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d');

    const tick = () => {
      if (video.paused || video.ended) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      // Match display sizes
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      if (offCtx && ctx) {
        try {
          offCtx.drawImage(video, 0, 0, width, height);
          const imgData = offCtx.getImageData(0, 0, width, height);
          const data = imgData.data;

          // Pre-create output array for grayscale
          const gray = new Uint8Array(width * height);
          for (let i = 0; i < data.length; i += 4) {
            gray[i >> 2] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
          }

          // Clear main canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // We'll draw detected edge segments on the main canvas with glowing style
          ctx.strokeStyle = 'rgba(0, 255, 127, 0.8)'; // Neon Green
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#00ff7f';
          ctx.beginPath();

          const scaleX = canvas.width / width;
          const scaleY = canvas.height / height;

          for (let y = 1; y < height - 1; y += 2) {
            for (let x = 1; x < width - 1; x += 2) {
              const idx = y * width + x;

              // Sobel horizontal/vertical gradients
              const val00 = gray[idx - width - 1];
              const val01 = gray[idx - width];
              const val02 = gray[idx - width + 1];
              const val10 = gray[idx - 1];
              const val12 = gray[idx + 1];
              const val20 = gray[idx + width - 1];
              const val21 = gray[idx + width];
              const val22 = gray[idx + width + 1];

              const gx = (val02 + 2 * val12 + val22) - (val00 + 2 * val10 + val20);
              const gy = (val20 + 2 * val21 + val22) - (val00 + 2 * val01 + val02);
              const mag = Math.sqrt(gx * gx + gy * gy);

              // Threshold to identify distinct edges
              if (mag > 90) {
                const px = x * scaleX;
                const py = y * scaleY;
                ctx.moveTo(px, py);
                ctx.lineTo(px + 2, py + 2);
              }
            }
          }
          ctx.stroke();
        } catch (e) {
          // Ignore cross-origin canvas security errors if camera has different host
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [active, videoRef]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}
