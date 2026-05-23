import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TcgCardImage from '@/components/TcgCardImage';
import RarityBadge from '@/components/RarityBadge';
import {
  CloseIcon,
  FlashIcon,
  InfoIcon,
  GalleryIcon,
  CheckIcon,
  SearchIcon,
} from '@/components/icons';
import { searchCards, isAbortError } from '@/lib/pokemonTcgApi';
import { useDebounced } from '@/lib/hooks';
import { getEstimatedPrice, formatPriceShort } from '@/lib/pricing';
import {
  isServerOcrEnabled,
  recognizeCardFromImage,
  resetRecognitionDemo,
  type RecognitionInput,
  type RecognitionResult,
} from '@/lib/cardRecognition';
import type { PokemonCard } from '@/types/pokemon';
import { saveCardMeta } from '@/lib/collectionStorage';
import { triggerHaptic } from '@/lib/haptic';
import EdgeDetectorCanvas from '@/components/EdgeDetectorCanvas';
import { compressForAI } from '@/lib/imageOptimization';
import { processAchievementEvent } from '@/lib/achievements';
import { dispatchAchievement } from '@/app/App';
import GradingDetectedPanel from './scan/GradingDetectedPanel';
import MulticardDetectedPanel from './scan/MulticardDetectedPanel';
import LowConfidencePanel from './scan/LowConfidencePanel';
import ScanControlsBar from './scan/ScanControlsBar';
import DarkPillButton from './scan/DarkPillButton';
import ScanBrackets from './scan/ScanBrackets';
import IdleHint from './scan/IdleHint';
import ScanningPanel from './scan/ScanningPanel';
import DetectedPanel from './scan/DetectedPanel';
import CorrectionSheet from './scan/CorrectionSheet';
import BlurWarningBanner from './scan/BlurWarningBanner';
import MulticardBoundingBoxes from './scan/MulticardBoundingBoxes';
import BatchSummaryPanel from './scan/BatchSummaryPanel';

export type ScanState = 'idle' | 'scanning' | 'detected' | 'lowConf';
export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

/**
 * Scanner: a dark camera-style UI.
 *
 * v1 capture paths (all enter `recognizeCardFromImage`):
 *   1. Live camera via `getUserMedia` when the browser allows it. On capture,
 *      we draw the current <video> frame to a canvas, produce a File, and pass
 *      it as `{ type: 'file', file }`.
 *   2. Hidden `<input type="file" accept="image/*" capture="environment">`
 *      behind the Galería button — works on every browser and on iOS where
 *      it opens the system camera or photo picker.
 *   3. If neither path is available (or while we're waiting on permissions),
 *      the big capture button falls back to `{ type: 'none' }`, which kicks
 *      off the simulated demo rotation.
 *
 * Recognition itself is still assisted/simulated in v1 — the file/frame is
 * not yet analyzed pixel-by-pixel. See `cardRecognition.ts` for the v2 TODO.
 */

/**
 * Lightweight, zero-dependency client-side image sharpness analyzer.
 * Uses pixel-intensity gradients of adjacent pixels on a scaled down canvas.
 */
async function checkImageBlur(file: File): Promise<{ isBlurry: boolean; score: number }> {
  return new Promise<{ isBlurry: boolean; score: number }>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = 150;
      canvas.height = 150;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve({ isBlurry: false, score: 99 });
        return;
      }
      ctx.drawImage(img, 0, 0, 150, 150);
      const imgData = ctx.getImageData(0, 0, 150, 150);
      const data = imgData.data;
      
      const grayscale = new Uint8Array(150 * 150);
      for (let i = 0; i < data.length; i += 4) {
        grayscale[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
      }

      let diffSum = 0;
      let count = 0;
      for (let y = 0; y < 150; y++) {
        for (let x = 0; x < 150; x++) {
          const idx = y * 150 + x;
          const val = grayscale[idx];
          
          if (x < 149) {
            diffSum += Math.abs(val - grayscale[idx + 1]);
            count++;
          }
          if (y < 149) {
            diffSum += Math.abs(val - grayscale[idx + 150]);
            count++;
          }
        }
      }

      const score = count > 0 ? diffSum / count : 99;
      // Sharpness threshold of 8 (below is considered blurry)
      resolve({ isBlurry: score < 8, score });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ isBlurry: false, score: 99 });
    };
    img.src = url;
  });
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

export default function ScanScreen() {
  const navigate = useNavigate();
  const serverOcrEnabled = isServerOcrEnabled();
  const [state, setState] = useState<ScanState>('idle');
  const [flash, setFlash] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [blurWarning, setBlurWarning] = useState(false);

  // Advanced Scanner Modes (Único, Lote, Multicarta, Evaluación)
  const [scanMode, setScanMode] = useState<'single' | 'batch' | 'multicard' | 'grading'>(() => {
    try {
      const mode = localStorage.getItem('carddex.scanner.scanMode');
      if (mode === 'batch' || mode === 'multicard' || mode === 'grading') return mode as any;
    } catch {}
    try {
      if (localStorage.getItem('carddex.scanner.isBatchMode') === 'true') return 'batch';
    } catch {}
    return 'single';
  });

  const isBatchMode = scanMode === 'batch';
  const isMulticardMode = scanMode === 'multicard';
  const isGradingMode = scanMode === 'grading';

  const [gradingResult, setGradingResult] = useState<any | null>(null);

  const [detectedMulticards, setDetectedMulticards] = useState<PokemonCard[]>([]);
  const [scannedBatch, setScannedBatch] = useState<RecognitionResult[]>([]);
  const [justAddedToBatch, setJustAddedToBatch] = useState(false);
  const [showBatchSaveToast, setShowBatchSaveToast] = useState(false);
  const [batchToastCount, setBatchToastCount] = useState(0);

  const handleSetScanMode = (mode: 'single' | 'batch' | 'multicard' | 'grading') => {
    setScanMode(mode);
    try {
      localStorage.setItem('carddex.scanner.scanMode', mode);
      localStorage.setItem('carddex.scanner.isBatchMode', String(mode === 'batch'));
    } catch {}
    
    // Reset scanner states to prevent UI conflicts
    setState('idle');
    setConfidence(0);
    setResult(null);
    setGradingResult(null);
    setDetectedMulticards([]);
    setBlurWarning(false);
    triggerHaptic('light');
  };

  // Selector de idioma OCR para optimizar el escaneo de cartas multilingües
  const [scanLanguage, setScanLanguage] = useState<'AUTO' | 'EN' | 'ES' | 'JP'>(() => {
    try {
      const saved = localStorage.getItem('carddex.scanner.language');
      if (saved === 'EN' || saved === 'ES' || saved === 'JP') return saved as any;
    } catch {}
    return 'AUTO';
  });

  const handleSetScanLanguage = (lang: 'AUTO' | 'EN' | 'ES' | 'JP') => {
    setScanLanguage(lang);
    try {
      localStorage.setItem('carddex.scanner.language', lang);
    } catch {}
    triggerHaptic('light');
  };

  // Estado de fluctuación cinética para simulación de rastreo espacial multicarta en tiempo real
  const [jitter, setJitter] = useState({
    x1: 0, y1: 0, scale1: 1, conf1: 98,
    x2: 0, y2: 0, scale2: 1, conf2: 96,
    x3: 0, y3: 0, scale3: 1, conf3: 95,
  });

  // Real-time CV edge alignment auto-scan states
  const [isAligned, setIsAligned] = useState(false);
  const [autoScanCountdown, setAutoScanCountdown] = useState(0);

  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('carddex_auto_scan_enabled');
      return stored !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem('carddex_auto_scan_enabled');
        setAutoScanEnabled(stored !== 'false');
      } catch {}
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    if (state !== 'detected' || !isMulticardMode) return;

    const interval = setInterval(() => {
      setJitter({
        x1: (Math.random() - 0.5) * 6, // fluctuación horizontal sutil
        y1: (Math.random() - 0.5) * 6, // fluctuación vertical sutil
        scale1: 0.98 + Math.random() * 0.04, // micro-zoom
        conf1: Math.floor(96 + Math.random() * 4),

        x2: (Math.random() - 0.5) * 6,
        y2: (Math.random() - 0.5) * 6,
        scale2: 0.98 + Math.random() * 0.04,
        conf2: Math.floor(94 + Math.random() * 4),

        x3: (Math.random() - 0.5) * 6,
        y3: (Math.random() - 0.5) * 6,
        scale3: 0.98 + Math.random() * 0.04,
        conf3: Math.floor(93 + Math.random() * 4),
      });
    }, 450);

    return () => clearInterval(interval);
  }, [state, isMulticardMode]);



  const handleSaveBatch = () => {
    if (scannedBatch.length === 0) return;
    
    // Sequence-save all cards to LocalStorage / Cloud
    scannedBatch.forEach((item) => {
      if (item.card) {
        saveCardMeta(item.card.id, {
          quantity: 1,
          owned: true,
          language: item.detectedLanguage || 'EN',
          updatedAt: new Date().toISOString(),
        });
      }
    });

    // Fire achievement event for scanning
    const newAchievements = processAchievementEvent({ type: 'scan_saved' });
    newAchievements.forEach(dispatchAchievement);

    // Show beautiful success Toast
    setBatchToastCount(scannedBatch.length);
    setShowBatchSaveToast(true);
    setTimeout(() => {
      setShowBatchSaveToast(false);
    }, 3000);

    // Vibrate and clear batch
    triggerHaptic('success');
    setScannedBatch([]);
  };

  const handleSaveMulticards = () => {
    if (detectedMulticards.length === 0) return;

    detectedMulticards.forEach((card) => {
      saveCardMeta(card.id, {
        quantity: 1,
        owned: true,
        updatedAt: new Date().toISOString(),
      });
    });

    setBatchToastCount(detectedMulticards.length);
    setShowBatchSaveToast(true);
    setTimeout(() => {
      setShowBatchSaveToast(false);
    }, 3000);

    triggerHaptic('success');
    
    // Clear and reset state
    setState('idle');
    setDetectedMulticards([]);
    setConfidence(0);
    setResult(null);
    setBlurWarning(false);
  };

  const handleClearBatch = () => {
    setScannedBatch([]);
    triggerHaptic('light');
  };

  const handleRemoveFromBatch = (cardId: string) => {
    setScannedBatch((prev) => prev.filter((item) => item.card?.id !== cardId));
    triggerHaptic('light');
  };

  // Refs for media-capture plumbing.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingInputRef = useRef<RecognitionInput>({ type: 'none' });

  const stopCameraStream = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Live camera stream lifecycle.
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraStatus('unsupported');
      return;
    }
    let stopped = false;
    setCameraStatus('starting');
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        setCameraStatus('live');
      })
      .catch((err: unknown) => {
        if (stopped) return;
        const name = err instanceof Error ? err.name : '';
        // Treat NotAllowedError / SecurityError as "denied" so the UI can
        // explain quietly. Everything else is just generic "error".
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setCameraStatus('denied');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setCameraStatus('unsupported');
        } else {
          setCameraStatus('error');
        }
      });
    return () => {
      stopped = true;
      stopCameraStream();
    };
  }, [stopCameraStream]);

  const cameraLive = cameraStatus === 'live';

  /** Grab the current camera frame as a File. Returns null on failure. */
  const captureFrame = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video || !cameraLive) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);

    const cv = (window as any).cv;
    const quad = (window as any).lastDetectedCardQuad;

    let targetCanvas = canvas;

    if (cv && cv.Mat && cv.matFromArray && cv.getPerspectiveTransform && cv.warpPerspective && quad && quad.length === 4) {
      // Perspective Warp with OpenCV
      let src: any = null;
      let dst: any = null;
      let srcTri: any = null;
      let dstTri: any = null;
      let M: any = null;
      try {
        const destWidth = 500;
        const destHeight = 700;
        src = cv.imread(canvas);
        dst = new cv.Mat();
        
        srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
          quad[0].x, quad[0].y,
          quad[1].x, quad[1].y,
          quad[2].x, quad[2].y,
          quad[3].x, quad[3].y,
        ]);
        
        dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          destWidth, 0,
          destWidth, destHeight,
          0, destHeight,
        ]);

        M = cv.getPerspectiveTransform(srcTri, dstTri);
        const dsize = new cv.Size(destWidth, destHeight);
        cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        const warpCanvas = document.createElement('canvas');
        warpCanvas.width = destWidth;
        warpCanvas.height = destHeight;
        cv.imshow(warpCanvas, dst);
        targetCanvas = warpCanvas;
      } catch {
        // If perspective correction fails, keep the original frame.
      } finally {
        if (src) src.delete();
        if (dst) dst.delete();
        if (srcTri) srcTri.delete();
        if (dstTri) dstTri.delete();
        if (M) M.delete();
      }
    }

    return new Promise<File | null>((resolve) => {
      targetCanvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          resolve(
            new File([blob], `carddex-capture-${Date.now()}.jpg`, {
              type: 'image/jpeg',
            }),
          );
        },
        'image/jpeg',
        0.9,
      );
    });
  }, [cameraLive]);

  const runScan = useCallback(async (input: RecognitionInput) => {
    setError(null);
    setConfidence(0);
    const start = Date.now();
    // Confidence bar animation, ~1.8s
    const tick = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 1800);
      setConfidence(Math.round(t * 92));
      if (t >= 1) window.clearInterval(tick);
    }, 60);

    try {
      if (isGradingMode) {
        let payloadGrading;
        if (input.type === 'file') {
          const rawBase64 = await fileToBase64(input.file);
          // Compress client-side before upload: typically 4MB → 300-500KB
          const base64 = await compressForAI(rawBase64, 500);
          const res = await fetch('/api/grade-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 }),
          });
          if (!res.ok) throw new Error('Error al evaluar la carta física.');
          payloadGrading = await res.json();
        } else {
          // Simulated demo mode
          const { OFFLINE_CARD_CATALOG } = await import('@/lib/offlineCardCatalog');
          const randomOffline = OFFLINE_CARD_CATALOG[Math.floor(Math.random() * OFFLINE_CARD_CATALOG.length)];
          payloadGrading = {
            cardName: randomOffline?.name || 'Charizard ex',
            centering: 9.5,
            corners: 9.0,
            edges: 9.0,
            surface: 9.5,
            overallGrade: 9.5,
            qualifier: 'Mint',
            issues: [
              'Desgaste milimétrico en el borde superior trasero.',
              'Centrado frontal ligeramente desplazado (60/40).'
            ]
          };
        }

        let cardObj = null;
        try {
          const { data } = await searchCards({ name: payloadGrading.cardName, pageSize: 1 });
          if (data && data.length > 0) {
            cardObj = data[0];
          }
        } catch {
          // The grading overlay can still show the simulated result.
        }

        const elapsed = Date.now() - start;
        if (elapsed < 1200) {
          await new Promise((r) => window.setTimeout(r, 1200 - elapsed));
        }
        window.clearInterval(tick);

        setConfidence(100);
        setGradingResult({ ...payloadGrading, cardObj });
        setState('detected');
        triggerHaptic('success');
        return;
      }

      if (isMulticardMode) {
        // Simular escaneo de 2 o 3 cartas populares del catálogo offline
        const { OFFLINE_CARD_CATALOG } = await import('@/lib/offlineCardCatalog');
        const charizard = OFFLINE_CARD_CATALOG.find(c => c.id === 'sv3-125') || OFFLINE_CARD_CATALOG[0];
        const pikachu = OFFLINE_CARD_CATALOG.find(c => c.id === 'cel25-25') || OFFLINE_CARD_CATALOG[1];
        const mewtwo = OFFLINE_CARD_CATALOG.find(c => c.id === 'sv4-58') || OFFLINE_CARD_CATALOG[2];
        const cardsToDetect = [charizard, pikachu, mewtwo].filter(Boolean);

        // Simulamos un retraso de 1.2 segundos para la experiencia visual premium
        const elapsed = Date.now() - start;
        if (elapsed < 1200) {
          await new Promise((r) => window.setTimeout(r, 1200 - elapsed));
        }
        window.clearInterval(tick);

        setConfidence(98);
        setDetectedMulticards(cardsToDetect);
        setState('detected');
        triggerHaptic('success');
        return;
      }

      const recognition = await recognizeCardFromImage(input, { languageHint: scanLanguage });

      // We still use a minimum of 800ms to ensure the visual feedback shows 
      // up briefly even if the network is extremely fast, but we drop the 1.8s.
      const elapsed = Date.now() - start;
      if (elapsed < 800) {
        await new Promise((r) => window.setTimeout(r, 800 - elapsed));
      }
      window.clearInterval(tick);

      if (!recognition.card || !recognition.highConfidence) {
        setConfidence(Math.round(recognition.confidence * 100));
        setResult(recognition);
        setState('lowConf');
        triggerHaptic('warning'); // Error vibration pattern
        return;
      }

      setConfidence(Math.round(recognition.confidence * 100));

      if (isBatchMode) {
        // Mode Lote: add to batch, trigger feedback, and auto-reset
        setScannedBatch((prev) => {
          const exists = prev.some((item) => item.card?.id === recognition.card?.id);
          if (exists) return prev;
          return [...prev, recognition];
        });
        setJustAddedToBatch(true);
        setTimeout(() => setJustAddedToBatch(false), 800);
        triggerHaptic('success');

        setState('idle');
        setConfidence(0);
        setResult(null);
        setBlurWarning(false);
      } else {
        // Mode Único: show single card detected panel
        setResult(recognition);
        setState('detected');
        triggerHaptic('success'); // Success vibration
      }
    } catch (err) {
      window.clearInterval(tick);
      setConfidence(0);
      if (isAbortError(err)) return;
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con el servicio de cartas.',
      );
      setState('lowConf');
    }
  }, [isBatchMode, isMulticardMode, isGradingMode]);

  useEffect(() => {
    if (state === 'scanning') {
      runScan(pendingInputRef.current);
    }
  }, [state, runScan]);

  useEffect(() => {
    if (!autoScanEnabled || !isAligned || state !== 'idle' || isMulticardMode) {
      setAutoScanCountdown(0);
      return;
    }

    const duration = 1200; // 1.2 seconds of stable alignment to trigger auto-scan
    const intervalTime = 40;
    const step = (intervalTime / duration) * 100;

    const timer = setInterval(() => {
      setAutoScanCountdown((prev) => {
        const next = prev + step;
        if (next >= 100) {
          clearInterval(timer);
          triggerHaptic('success');
          captureFrame().then((file) => {
            if (file) {
              runScan({ type: 'file', file });
            } else {
              runScan({ type: 'none' });
            }
          });
          return 0;
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [autoScanEnabled, isAligned, state, isMulticardMode, captureFrame, runScan]);

  const triggerScan = async () => {
    if (state === 'detected') {
      setState('idle');
      setConfidence(0);
      setResult(null);
      setBlurWarning(false);
      triggerHaptic('light');
      return;
    }
    if (state === 'scanning') return;
    
    triggerHaptic('light'); // Tap vibration
    setBlurWarning(false);

    // Pre-arm the input for runScan. If the camera is live we grab a frame
    // and forward it as a File; otherwise we use the demo path.
    if (cameraLive) {
      const file = await captureFrame();
      if (file) {
        const blurCheck = await checkImageBlur(file);
        if (blurCheck.isBlurry) {
          setBlurWarning(true);
        }
        pendingInputRef.current = { type: 'file', file };
      } else {
        pendingInputRef.current = { type: 'none' };
      }
    } else {
      pendingInputRef.current = { type: 'none' };
    }
    setState('scanning');
  };

  /** Open the hidden file picker (works as gallery + as system camera on iOS). */
  const openFilePicker = () => fileInputRef.current?.click();

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected later.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    setBlurWarning(false);
    const blurCheck = await checkImageBlur(file);
    if (blurCheck.isBlurry) {
      setBlurWarning(true);
    }

    pendingInputRef.current = { type: 'file', file };
    setState('scanning');
  };

  const handleClose = () => {
    stopCameraStream();
    resetRecognitionDemo();
    navigate('/');
  };

  const accent = 'var(--accent)';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--scanner-bg)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          position: 'relative',
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '56px 18px 0',
        }}
      >
        <DarkPillButton onClick={handleClose} aria="Cerrar">
          <CloseIcon size={20} />
        </DarkPillButton>

        <ScanControlsBar scanMode={scanMode} onSetScanMode={handleSetScanMode} />

        <div style={{ display: 'flex', gap: 10 }}>
          <DarkPillButton onClick={() => setCorrectOpen(true)} aria="Información">
            <InfoIcon size={20} />
          </DarkPillButton>
          <DarkPillButton
            onClick={() => setFlash((f) => !f)}
            active={flash}
            activeColor="#FFD60A"
            aria="Linterna"
          >
            <FlashIcon size={20} />
          </DarkPillButton>
        </div>
      </div>

      {/* Instructions */}
      <div style={{ textAlign: 'center', padding: '20px 24px 12px', minHeight: 74 }}>
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 0,
            transition: 'opacity 200ms',
          }}
        >
          {state === 'idle' && (isBatchMode ? 'Escaneo continuo en lote' : isMulticardMode ? 'Escaneo Multicarta Simultáneo' : 'Toma una foto de la carta')}
          {state === 'scanning' && (isMulticardMode ? 'Identificando cartas…' : 'Identificando carta…')}
          {state === 'detected' && (isMulticardMode ? '¡Cartas detectadas!' : '¡Carta detectada!')}
          {state === 'lowConf' && 'Detección poco fiable'}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.55)',
            marginTop: 4,
            letterSpacing: 0,
          }}
        >
          {state === 'idle' && (isBatchMode ? `Acumuladas: ${scannedBatch.length} cartas en bandeja` : isMulticardMode ? 'Coloca múltiples cartas en el visor' : 'Alinea la carta dentro del marco')}
          {state === 'scanning' && 'Mantén la cámara estable'}
          {state === 'detected' && (isMulticardMode ? 'Revisa y guarda todo tu lote de cartas' : 'Revisa los detalles antes de guardar')}
          {state === 'lowConf' &&
            (error ?? 'Inténtalo de nuevo o introduce los datos manualmente')}
        </div>
        <div
          style={{
            display: 'inline-flex',
            marginTop: 8,
            padding: '4px 9px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.58)',
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.1,
          }}
        >
          {serverOcrEnabled
            ? 'OCR servidor activo · captura enviada sólo al confirmar escaneo'
            : 'Assisted scan prototype · cámara local, confirma sugerencias'}
        </div>
      </div>

      {/* Camera frame */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 30px',
          minHeight: 0,
        }}
      >
        {/* viewport surface */}
        <div
          style={{
            position: 'absolute',
            inset: '0 24px',
            background: 'radial-gradient(circle at center, #1d1810 0%, #0a0807 70%)',
            borderRadius: 28,
            overflow: 'hidden',
          }}
        >
          {/* Live camera feed — fills the viewport when permission was granted */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: cameraLive ? 0.9 : 0,
              transition: 'opacity 400ms ease',
            }}
            aria-hidden
          />
           <EdgeDetectorCanvas
            videoRef={videoRef}
            active={cameraLive && state === 'idle'}
            onAlignmentChange={(score, aligned) => {
              if (state === 'idle') {
                setIsAligned(aligned);
              } else {
                setIsAligned(false);
              }
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'repeating-linear-gradient(120deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 7px)',
              mixBlendMode: cameraLive ? 'overlay' : 'normal',
            }}
          />

          {/* Real-time CV HUD overlay when alignment is in progress */}
          {state === 'idle' && autoScanCountdown > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              {/* Glowing circular loader */}
              <div
                style={{
                  position: 'relative',
                  width: 90,
                  height: 90,
                  background: 'rgba(12, 14, 26, 0.82)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderRadius: '50%',
                  border: '1px solid rgba(0, 255, 127, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 32px rgba(0, 255, 127, 0.2), inset 0 0 12px rgba(0, 255, 127, 0.05)',
                }}
              >
                <svg width="76" height="76" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
                  {/* Track ring */}
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.06)"
                    strokeWidth="4"
                  />
                  {/* Progress ring with glow */}
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="url(#neonGlowGradient)"
                    strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - autoScanCountdown / 100)}`}
                    strokeLinecap="round"
                    style={{
                      transition: 'stroke-dashoffset 40ms linear',
                      filter: 'drop-shadow(0px 0px 5px #00ff7f)',
                    }}
                  />
                  <defs>
                    <linearGradient id="neonGlowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00ff7f" />
                      <stop offset="100%" stopColor="#34C759" />
                    </linearGradient>
                  </defs>
                </svg>
                {/* Countdown percentage */}
                <div style={{
                  position: 'absolute',
                  fontSize: 15,
                  fontWeight: 900,
                  color: '#00ff7f',
                  letterSpacing: 0,
                  textShadow: '0 0 8px rgba(0, 255, 127, 0.65)',
                }}>
                  {Math.min(100, Math.round(autoScanCountdown))}%
                </div>
              </div>
              <div
                style={{
                  background: 'rgba(12, 14, 26, 0.85)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(0, 255, 127, 0.25)',
                  borderRadius: 20,
                  padding: '6px 14px',
                  fontSize: 10,
                  fontWeight: 900,
                  color: '#00ff7f',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  boxShadow: '0 4px 16px rgba(0, 255, 127, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#00ff7f',
                  boxShadow: '0 0 6px #00ff7f',
                  animation: 'pulseIndicator 1s ease-in-out infinite',
                }} />
                Auto-Escaneando
              </div>
              <style>{`
                @keyframes pulseIndicator {
                  0%, 100% { opacity: 0.5; transform: scale(0.9); }
                  50% { opacity: 1; transform: scale(1.1); }
                }
              `}</style>
            </div>
          )}

          {/* Pulsing glassmorphic overlay during analysis */}
          {state === 'scanning' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                animation: 'pulseGlass 2s ease-in-out infinite',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Ambient light glow behind the card guide when detected or added to batch */}
          {(state === 'detected' || justAddedToBatch) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at center, rgba(52, 199, 89, 0.25) 0%, transparent 70%)',
                zIndex: 2,
                pointerEvents: 'none',
                animation: justAddedToBatch ? 'flashGreen 800ms ease-out' : 'none',
              }}
            />
          )}

          {/* Gentle dynamic blur warning inside the viewport */}
          {blurWarning && <BlurWarningBanner />}

          {isMulticardMode && state === 'detected' && detectedMulticards.length > 0 && (
            <MulticardBoundingBoxes detectedMulticards={detectedMulticards} jitter={jitter} />
          )}
        </div>

        {/* corner brackets */}
        {!isMulticardMode && <ScanBrackets state={state} isAligned={isAligned} />}

        {/* card preview — appears once scanning starts */}
        {!isMulticardMode && state !== 'idle' && result?.card && (
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              transform: 'rotate(-1deg)',
              animation: 'cardFloat 4s ease-in-out infinite',
              opacity: state === 'scanning' ? 0.85 : 1,
              filter: state === 'scanning' ? 'blur(0.5px) brightness(0.95)' : 'none',
              transition: 'all 220ms',
            }}
          >
            <TcgCardImage card={result.card} width={200} large />
          </div>
        )}

        {/* scanning without card yet — show a card-shaped silhouette */}
        {!isMulticardMode && state === 'scanning' && !result?.card && (
          <div
            style={{
              width: 200,
              height: 280,
              border: '2px solid rgba(255,255,255,0.15)',
              borderRadius: 14,
              position: 'relative',
              zIndex: 1,
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
            }}
          />
        )}

        {/* idle: outlined card-shaped guide */}
        {!isMulticardMode && state === 'idle' && (
          <div
            style={{
              width: 220,
              height: 308,
              border: '2px dashed rgba(255, 255, 255, 0.25)',
              borderRadius: 16,
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              background: 'rgba(255, 255, 255, 0.01)',
              animation: 'pulseViewfinder 2s ease-in-out infinite',
              padding: 20,
              textAlign: 'center',
            }}
          >
            {/* Brackets in the four corners */}
            <div style={{
              position: 'absolute',
              top: -2,
              left: -2,
              width: 20,
              height: 20,
              borderTop: '3px solid var(--accent)',
              borderLeft: '3px solid var(--accent)',
              borderTopLeftRadius: 16,
              boxShadow: '0 0 8px var(--accent)',
            }} />
            <div style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 20,
              height: 20,
              borderTop: '3px solid var(--accent)',
              borderRight: '3px solid var(--accent)',
              borderTopRightRadius: 16,
              boxShadow: '0 0 8px var(--accent)',
            }} />
            <div style={{
              position: 'absolute',
              bottom: -2,
              left: -2,
              width: 20,
              height: 20,
              borderBottom: '3px solid var(--accent)',
              borderLeft: '3px solid var(--accent)',
              borderBottomLeftRadius: 16,
              boxShadow: '0 0 8px var(--accent)',
            }} />
            <div style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 20,
              height: 20,
              borderBottom: '3px solid var(--accent)',
              borderRight: '3px solid var(--accent)',
              borderBottomRightRadius: 16,
              boxShadow: '0 0 8px var(--accent)',
            }} />
            
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.85)',
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
              letterSpacing: 0,
              maxWidth: 180,
              lineHeight: 1.4,
            }}>
              Alinea la carta física en este recuadro
            </div>
          </div>
        )}

        {/* Multicard Guides */}
        {isMulticardMode && state === 'idle' && (
          <div style={{ position: 'relative', width: 260, height: 300, zIndex: 1 }}>
            <div
              style={{
                width: 140,
                height: 196,
                border: '2px dashed rgba(255,255,255,0.18)',
                borderRadius: 12,
                position: 'absolute',
                top: 15,
                left: 10,
                transform: 'rotate(-8deg)',
                background: 'rgba(255, 255, 255, 0.01)',
              }}
            />
            <div
              style={{
                width: 140,
                height: 196,
                border: '2px dashed rgba(255, 255, 255, 0.22)',
                borderRadius: 12,
                position: 'absolute',
                bottom: 15,
                right: 10,
                transform: 'rotate(6deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.02)',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'center',
                padding: 10,
              }}
            >
              Coloca múltiples cartas
            </div>
          </div>
        )}

        {isMulticardMode && state === 'scanning' && (
          <div style={{ position: 'relative', width: 260, height: 300, zIndex: 1 }}>
            <div
              style={{
                width: 140,
                height: 196,
                border: '2px solid var(--accent)',
                borderRadius: 12,
                position: 'absolute',
                top: 25,
                left: 15,
                transform: 'rotate(-5deg)',
                animation: 'pulseBracket 1.2s ease-in-out infinite',
                opacity: 0.65,
              }}
            />
            <div
              style={{
                width: 140,
                height: 196,
                border: '2px solid #34C759',
                borderRadius: 12,
                position: 'absolute',
                bottom: 25,
                right: 15,
                transform: 'rotate(4deg)',
                animation: 'pulseBracket 1.5s ease-in-out infinite',
                opacity: 0.75,
              }}
            />
          </div>
        )}

        {/* scan line — only while scanning */}
        {state === 'scanning' && (
          <div
            style={{
              position: 'absolute',
              left: 40,
              right: 40,
              height: 4,
              background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3) 20%, ${accent} 50%, rgba(255,255,255,0.3) 80%, transparent)`,
              boxShadow: `0 0 15px 3px ${accent}, 0 0 30px 6px ${accent}88`,
              animation: 'scanLine 2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}
      </div>

      {/* Bottom result / status panel */}
      <div style={{ padding: '0 14px 12px' }}>
        {state === 'idle' && !isBatchMode && (
          <IdleHint cameraStatus={cameraStatus} isMulticardMode={isMulticardMode} />
        )}
        {state === 'idle' && isBatchMode && scannedBatch.length === 0 && (
          <IdleHint cameraStatus={cameraStatus} />
        )}
        {state === 'scanning' && <ScanningPanel confidence={confidence} />}
        {state === 'detected' && result?.card && !isBatchMode && !isMulticardMode && (
          <DetectedPanel
            result={result}
            confidence={confidence}
            onView={() =>
              navigate(`/card/${encodeURIComponent(result.card!.id)}`)
            }
            onWrong={() => setCorrectOpen(true)}
          />
        )}
        {state === 'detected' && isGradingMode && gradingResult && (
          <GradingDetectedPanel
            gradingResult={gradingResult}
            onRetry={() => {
              setBlurWarning(false);
              setState('idle');
              setGradingResult(null);
            }}
          />
        )}
        {state === 'detected' && isMulticardMode && detectedMulticards.length > 0 && (
          <MulticardDetectedPanel
            detectedCards={detectedMulticards}
            onSave={handleSaveMulticards}
            onRetry={() => {
              setBlurWarning(false);
              setState('idle');
              setDetectedMulticards([]);
            }}
          />
        )}
        {state === 'lowConf' && (
          <LowConfidencePanel
            onRetry={() => {
              setBlurWarning(false);
              setState('idle');
            }}
            onManual={() => setCorrectOpen(true)}
            message={error}
          />
        )}

        {/* Tray when batch has items */}
        {isBatchMode && scannedBatch.length > 0 && (
          <BatchSummaryPanel
            scannedBatch={scannedBatch}
            onClearBatch={handleClearBatch}
            onRemoveCard={handleRemoveFromBatch}
            onSaveBatch={handleSaveBatch}
          />
        )}
      </div>

      {/* Hidden file input — opened by the Galería button. Without the `capture`
          attribute, this prompts the user to pick an image from their photo
          library (or take a new picture, depending on the OS). */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFilePicked}
        style={{ display: 'none' }}
        aria-hidden
      />

      {/* Selector de Idioma OCR Flotante */}
      {state === 'idle' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            margin: '0 0 10px',
            zIndex: 10,
            animation: 'fadeIn 300ms ease-out',
          }}
        >
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255, 255, 255, 0.4)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Idioma OCR:
          </span>
          <div
            style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: 999,
              padding: 2,
              border: '0.5px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            {(['AUTO', 'EN', 'ES', 'JP'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => handleSetScanLanguage(lang)}
                aria-pressed={scanLanguage === lang}
                aria-label={`Idioma OCR ${lang}`}
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: 'none',
                  background: scanLanguage === lang ? 'var(--accent)' : 'transparent',
                  color: scanLanguage === lang ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  fontFamily: 'inherit',
                }}
              >
                {lang === 'AUTO' ? '🌐 AUTO' : lang === 'EN' ? '🇺🇸 EN' : lang === 'ES' ? '🇪🇸 ES' : '🇯🇵 JP'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '6px 30px 40px',
        }}
      >
        <button
          type="button"
          style={controlBtn(false)}
          onClick={openFilePicker}
          aria-label="Subir imagen desde galería o cámara"
        >
          <GalleryIcon size={20} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>Galería</span>
        </button>

        <button
          type="button"
          onClick={triggerScan}
          aria-label={
            state === 'detected'
              ? 'Resetear escaneo'
              : state === 'scanning'
                ? 'Escaneando'
                : 'Capturar carta'
          }
          style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: state === 'detected' ? 'var(--success)' : '#fff',
            border: '4px solid rgba(255,255,255,0.4)',
            boxShadow:
              state === 'scanning'
                ? `0 0 0 2px ${accent}`
                : '0 0 0 2px rgba(255,255,255,0.2), 0 8px 24px rgba(0,0,0,0.4)',
            cursor: state === 'scanning' ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 200ms',
            padding: 0,
          }}
          disabled={state === 'scanning'}
        >
          {state === 'scanning' && (
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                border: `3px solid ${accent}`,
                borderTopColor: 'transparent',
                animation: 'spin 0.9s linear infinite',
              }}
            />
          )}
          {state === 'detected' && <CheckIcon size={28} color="#fff" />}
        </button>

        <button
          type="button"
          onClick={() => setFlash((f) => !f)}
          aria-label={flash ? 'Apagar luz' : 'Encender luz'}
          aria-pressed={flash}
          style={controlBtn(flash)}
        >
          <FlashIcon size={20} />
          <span
            style={{
              fontSize: 9,
              color: flash ? '#FFD60A' : 'rgba(255,255,255,0.7)',
            }}
          >
            Luz
          </span>
        </button>
      </div>

      {/* Toast de Guardado Exitoso en Lote */}
      {showBatchSaveToast && (
        <div style={{
          position: 'absolute',
          top: 110,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(52, 199, 89, 0.15)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(52, 199, 89, 0.4)',
          borderRadius: 14,
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 100,
          boxShadow: '0 8px 32px rgba(52, 199, 89, 0.2)',
          animation: 'toastEnter 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#34C759',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <CheckIcon size={12} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>¡Lote Guardado!</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
              Se agregaron {batchToastCount} cartas a tu colección
            </div>
          </div>
        </div>
      )}

      {/* Manual correction sheet */}
      {correctOpen && (
        <CorrectionSheet
          onClose={() => setCorrectOpen(false)}
          onPick={(picked) => {
            setCorrectOpen(false);
            navigate(`/card/${encodeURIComponent(picked.id)}`);
          }}
        />
      )}
      <style>{`
        @keyframes pulseViewfinder {
          0% { opacity: 0.4; }
          50% { opacity: 0.9; }
          100% { opacity: 0.4; }
        }
        @keyframes scanLine {
          0% { transform: translateY(-140px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(140px); opacity: 0; }
        }
        @keyframes pulseBracket {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.04); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulseGlass {
          0% { opacity: 0.35; backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
          50% { opacity: 0.75; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
          100% { opacity: 0.35; backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
        }
        @keyframes pulseWarning {
          0% { transform: translate(-50%, 0) scale(1); }
          50% { transform: translate(-50%, 0) scale(1.02); box-shadow: 0 8px 32px rgba(255, 214, 10, 0.2); }
          100% { transform: translate(-50%, 0) scale(1); }
        }
        @keyframes toastEnter {
          0% { transform: translate(-50%, -20px); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes flashGreen {
          0% { opacity: 0; }
          20% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes slideUp {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes popIn {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* Helper style for scanner controls */

function controlBtn(active: boolean) {
  return {
    width: 50,
    height: 50,
    borderRadius: 14,
    background: active ? 'rgba(255,214,10,0.15)' : 'rgba(255,255,255,0.08)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    color: active ? '#FFD60A' : '#fff',
    display: 'inline-flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
  };
}
