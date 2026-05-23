import React, { useRef, useEffect } from 'react';

interface EdgeDetectorCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onAlignmentChange?: (score: number, isAligned: boolean) => void;
}

function sortPointsClockwise(pts: { x: number; y: number }[]) {
  // Sort by y-coordinate to separate top and bottom points
  const sortedByY = [...pts].sort((a, b) => a.y - b.y);
  const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomTwo = sortedByY.slice(2, 4).sort((a, b) => b.x - a.x);
  // Return order: Top-Left, Top-Right, Bottom-Right, Bottom-Left
  return [topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0]];
}

export default function EdgeDetectorCanvas({
  videoRef,
  active,
  onAlignmentChange,
}: EdgeDetectorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastCallbackRef = useRef<number>(0);

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
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

    let lastProcessTime = 0;
    const tick = () => {
      if (video.paused || video.ended) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      const now = Date.now();
      // Throttle heavy image analysis to ~8 fps (every 120ms) to save CPU/battery and prevent E2E timeouts
      if (now - lastProcessTime < 120) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }
      lastProcessTime = now;

      // Match display sizes
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      const cv = (window as any).cv;
      const isOpenCvReady = cv && cv.Mat && cv.MatVector && cv.approxPolyDP;

      if (offCtx && ctx) {
        if (!isOpenCvReady) {
          // -----------------------------------------------------------------
          // Fallback: Ultra-fast Sobel Edge Detection (Native JS)
          // -----------------------------------------------------------------
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

            // Expected viewfinder boundaries in processing space (inset: '20px 50px')
            const borderTop = Math.round((20 / canvas.height) * height);
            const borderBottom = Math.round(((canvas.height - 20) / canvas.height) * height);
            const borderLeft = Math.round((50 / canvas.width) * width);
            const borderRight = Math.round(((canvas.width - 50) / canvas.width) * width);

            ctx.strokeStyle = 'rgba(0, 255, 127, 0.8)'; // Neon Green
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#00ff7f';
            ctx.beginPath();

            const scaleX = canvas.width / width;
            const scaleY = canvas.height / height;
            let boundaryEdgeCount = 0;
            const margin = 2;

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

                if (mag > 90) {
                  const px = x * scaleX;
                  const py = y * scaleY;
                  ctx.moveTo(px, py);
                  ctx.lineTo(px + 2, py + 2);

                  const nearLeft = Math.abs(x - borderLeft) <= margin;
                  const nearRight = Math.abs(x - borderRight) <= margin;
                  const nearTop = Math.abs(y - borderTop) <= margin;
                  const nearBottom = Math.abs(y - borderBottom) <= margin;

                  if ((nearLeft || nearRight) && y >= borderTop && y <= borderBottom) {
                    boundaryEdgeCount++;
                  } else if ((nearTop || nearBottom) && x >= borderLeft && x <= borderRight) {
                    boundaryEdgeCount++;
                  }
                }
              }
            }
            ctx.stroke();

            // Throttled alignment state update
            const now = Date.now();
            if (now - lastCallbackRef.current > 150) {
              lastCallbackRef.current = now;
              const isAligned = boundaryEdgeCount >= 16;
              if (onAlignmentChange) {
                onAlignmentChange(boundaryEdgeCount, isAligned);
              }
            }
          } catch (e) {
            // Ignore cross-origin canvas security errors
          }
        } else {
          // -----------------------------------------------------------------
          // Premium: OpenCV.js Contour Detection & Perspective Fit
          // -----------------------------------------------------------------
          try {
            offCtx.drawImage(video, 0, 0, width, height);
            const src = cv.imread(offscreen);
            const grayMat = new cv.Mat();
            cv.cvtColor(src, grayMat, cv.COLOR_RGBA2GRAY);

            const blurred = new cv.Mat();
            cv.GaussianBlur(grayMat, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

            const edges = new cv.Mat();
            cv.Canny(blurred, edges, 50, 150, 3, false);

            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let bestContourIdx = -1;
            let maxArea = 0;
            let bestPoints: { x: number; y: number }[] = [];

            for (let i = 0; i < contours.size(); ++i) {
              const contour = contours.get(i);
              const area = cv.contourArea(contour);
              if (area > 1500) {
                const approx = new cv.Mat();
                const peri = cv.arcLength(contour, true);
                cv.approxPolyDP(contour, approx, 0.02 * peri, true);

                if (approx.rows === 4 && cv.isContourConvex(approx)) {
                  // Calculate bounding aspect ratio to filter card-like shapes
                  const rect = cv.minAreaRect(contour);
                  let ar = rect.size.width / rect.size.height;
                  if (ar > 1) ar = 1 / ar;
                  // Card ratio is 2.5 / 3.5 = 0.71. Accept 0.55 to 0.88
                  if (ar >= 0.55 && ar <= 0.88 && area > maxArea) {
                    maxArea = area;
                    bestContourIdx = i;
                    bestPoints = [
                      { x: approx.data32S[0], y: approx.data32S[1] },
                      { x: approx.data32S[2], y: approx.data32S[3] },
                      { x: approx.data32S[4], y: approx.data32S[5] },
                      { x: approx.data32S[6], y: approx.data32S[7] },
                    ];
                  }
                }
                approx.delete();
              }
              contour.delete();
            }

            // Clear main canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let isAligned = false;
            if (bestContourIdx !== -1 && bestPoints.length === 4) {
              isAligned = true;
              ctx.strokeStyle = 'rgba(0, 255, 127, 0.9)'; // Neon Green
              ctx.lineWidth = 3.5;
              ctx.shadowBlur = 10;
              ctx.shadowColor = '#00ff7f';
              ctx.beginPath();

              const scaleX = canvas.width / width;
              const scaleY = canvas.height / height;
              const screenPts = bestPoints.map((p) => ({
                x: p.x * scaleX,
                y: p.y * scaleY,
              }));

              const sorted = sortPointsClockwise(screenPts);

              ctx.moveTo(sorted[0].x, sorted[0].y);
              ctx.lineTo(sorted[1].x, sorted[1].y);
              ctx.lineTo(sorted[2].x, sorted[2].y);
              ctx.lineTo(sorted[3].x, sorted[3].y);
              ctx.closePath();
              ctx.stroke();

              // Draw neon corner markers
              sorted.forEach((p) => {
                ctx.fillStyle = '#00ff7f';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
                ctx.fill();
              });

              // Map coordinates back to native video space for the high-res warp
              const videoScaleX = video.videoWidth / width;
              const videoScaleY = video.videoHeight / height;
              const nativeSortedPoints = bestPoints.map((p) => ({
                x: p.x * videoScaleX,
                y: p.y * videoScaleY,
              }));

              (window as any).lastDetectedCardQuad = sortPointsClockwise(nativeSortedPoints);
            } else {
              (window as any).lastDetectedCardQuad = null;
            }

            // Throttled alignment status update
            const now = Date.now();
            if (now - lastCallbackRef.current > 150) {
              lastCallbackRef.current = now;
              if (onAlignmentChange) {
                onAlignmentChange(maxArea > 0 ? 30 : 0, isAligned);
              }
            }

            // Memory cleanups (critical to prevent WASM heap exhaustion)
            src.delete();
            grayMat.delete();
            blurred.delete();
            edges.delete();
            contours.delete();
            hierarchy.delete();
          } catch (err) {
            console.error('[OpenCV Overlay] Error in frame tick:', err);
          }
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [active, videoRef, onAlignmentChange]);

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
