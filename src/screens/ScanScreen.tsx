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
  recognizeCardFromImage,
  resetRecognitionDemo,
  type RecognitionInput,
  type RecognitionResult,
  OFFLINE_CARD_CATALOG,
} from '@/lib/cardRecognition';
import type { PokemonCard } from '@/types/pokemon';
import { saveCardMeta } from '@/lib/collectionStorage';
import { triggerHaptic } from '@/lib/haptic';
import EdgeDetectorCanvas from '@/components/EdgeDetectorCanvas';

type ScanState = 'idle' | 'scanning' | 'detected' | 'lowConf';
type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

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
      const ctx = canvas.getContext('2d');
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingInputRef = useRef<RecognitionInput>({ type: 'none' });

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
    let stream: MediaStream | null = null;
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
        stream = s;
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
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
    return new Promise<File | null>((resolve) => {
      canvas.toBlob(
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
          const base64 = await fileToBase64(input.file);
          const res = await fetch('/api/grade-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 }),
          });
          if (!res.ok) throw new Error('Error al evaluar la carta física.');
          payloadGrading = await res.json();
        } else {
          // Simulated demo mode
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
        } catch (e) {
          console.error('Error fetching card detail for grading overlay:', e);
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

        {/* Sliding glassmorphic mode selector */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 999,
            padding: 2,
            border: '0.5px solid rgba(255, 255, 255, 0.12)',
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          <button
            onClick={() => handleSetScanMode('single')}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: 'none',
              background: scanMode === 'single' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              color: scanMode === 'single' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 200ms ease',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>📷 Único</span>
          </button>
          <button
            onClick={() => handleSetScanMode('batch')}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: 'none',
              background: scanMode === 'batch' ? 'var(--accent)' : 'transparent',
              color: scanMode === 'batch' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 200ms ease',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>📦 Lote</span>
          </button>
          <button
            onClick={() => handleSetScanMode('multicard')}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: 'none',
              background: scanMode === 'multicard' ? 'linear-gradient(135deg, #7B5AD9 0%, #2F6FE0 100%)' : 'transparent',
              color: scanMode === 'multicard' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 200ms ease',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>🔮 Multi</span>
          </button>
          <button
            onClick={() => handleSetScanMode('grading')}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: 'none',
              background: scanMode === 'grading' ? 'linear-gradient(135deg, #FF9500 0%, #FF2D55 100%)' : 'transparent',
              color: scanMode === 'grading' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 200ms ease',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>⚖️ Evaluación</span>
          </button>
        </div>

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
      <div style={{ textAlign: 'center', padding: '20px 24px 12px', minHeight: 56 }}>
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: -0.3,
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
            letterSpacing: -0.1,
          }}
        >
          {state === 'idle' && (isBatchMode ? `Acumuladas: ${scannedBatch.length} cartas en bandeja` : isMulticardMode ? 'Coloca múltiples cartas en el visor' : 'Alinea la carta dentro del marco')}
          {state === 'scanning' && 'Mantén la cámara estable'}
          {state === 'detected' && (isMulticardMode ? 'Revisa y guarda todo tu lote de cartas' : 'Revisa los detalles antes de guardar')}
          {state === 'lowConf' &&
            (error ?? 'Inténtalo de nuevo o introduce los datos manualmente')}
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
          <EdgeDetectorCanvas videoRef={videoRef} active={cameraLive && state === 'idle'} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'repeating-linear-gradient(120deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 7px)',
              mixBlendMode: cameraLive ? 'overlay' : 'normal',
            }}
          />

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
          {blurWarning && (
            <div
              style={{
                position: 'absolute',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(255, 214, 10, 0.15)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 214, 10, 0.3)',
                borderRadius: 12,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                zIndex: 15,
                width: '85%',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                animation: 'pulseWarning 2s infinite',
                pointerEvents: 'none',
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span
                style={{
                  fontSize: 11.5,
                  color: '#FFD60A',
                  fontWeight: 600,
                  letterSpacing: -0.1,
                  lineHeight: 1.3,
                }}
              >
                Foto borrosa detectada. Enfoca mejor para mayor precisión.
              </span>
            </div>
          )}

          {isMulticardMode && state === 'detected' && detectedMulticards.length > 0 && (
            <>
              {detectedMulticards[0] && (
                <div
                  style={{
                    position: 'absolute',
                    top: '12%',
                    left: '6%',
                    width: '42%',
                    height: '50%',
                    border: '2.5px solid #7B5AD9',
                    borderRadius: 16,
                    boxShadow: '0 0 20px rgba(123, 90, 217, 0.4), inset 0 0 12px rgba(123, 90, 217, 0.2)',
                    animation: 'popIn 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    zIndex: 10,
                    transform: `translate3d(${jitter.x1}px, ${jitter.y1}px, 0) scale(${jitter.scale1})`,
                    transition: 'transform 450ms cubic-bezier(0.25, 0.8, 0.25, 1)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -30,
                      left: 0,
                      background: 'rgba(20, 22, 30, 0.85)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      border: '0.5px solid rgba(123, 90, 217, 0.4)',
                      padding: '4px 10px',
                      borderRadius: 8,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7B5AD9' }} />
                    <span>{detectedMulticards[0].name} ({jitter.conf1}%)</span>
                  </div>
                </div>
              )}
              {detectedMulticards[1] && (
                <div
                  style={{
                    position: 'absolute',
                    top: '38%',
                    left: '52%',
                    width: '42%',
                    height: '50%',
                    border: '2.5px solid #E07A25',
                    borderRadius: 16,
                    boxShadow: '0 0 20px rgba(224, 122, 37, 0.4), inset 0 0 12px rgba(224, 122, 37, 0.2)',
                    animation: 'popIn 450ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    zIndex: 10,
                    transform: `translate3d(${jitter.x2}px, ${jitter.y2}px, 0) scale(${jitter.scale2})`,
                    transition: 'transform 450ms cubic-bezier(0.25, 0.8, 0.25, 1)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -30,
                      left: 0,
                      background: 'rgba(20, 22, 30, 0.85)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      border: '0.5px solid rgba(224, 122, 37, 0.4)',
                      padding: '4px 10px',
                      borderRadius: 8,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E07A25' }} />
                    <span>{detectedMulticards[1].name} ({jitter.conf2}%)</span>
                  </div>
                </div>
              )}
              {detectedMulticards[2] && (
                <div
                  style={{
                    position: 'absolute',
                    top: '46%',
                    left: '10%',
                    width: '38%',
                    height: '46%',
                    border: '2.5px solid #2F6FE0',
                    borderRadius: 16,
                    boxShadow: '0 0 20px rgba(47, 111, 224, 0.4), inset 0 0 12px rgba(47, 111, 224, 0.2)',
                    animation: 'popIn 550ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    zIndex: 9,
                    transform: `translate3d(${jitter.x3}px, ${jitter.y3}px, 0) scale(${jitter.scale3})`,
                    transition: 'transform 450ms cubic-bezier(0.25, 0.8, 0.25, 1)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -30,
                      left: 0,
                      background: 'rgba(20, 22, 30, 0.85)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      border: '0.5px solid rgba(47, 111, 224, 0.4)',
                      padding: '4px 10px',
                      borderRadius: 8,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2F6FE0' }} />
                    <span>{detectedMulticards[2].name} ({jitter.conf3}%)</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* corner brackets */}
        {!isMulticardMode && <ScanBrackets state={state} />}

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
              width: 210,
              height: 294,
              border: '2px dashed rgba(255,255,255,0.25)',
              borderRadius: 14,
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 13,
              letterSpacing: -0.1,
            }}
          >
            Coloca la carta aquí
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
          <div
            className="batch-tray-enter"
            style={{
              background: 'rgba(20,22,30,0.7)',
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              border: '0.5px solid rgba(255,255,255,0.12)',
              borderRadius: 22,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              animation: 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0 2px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px var(--accent)',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>
                  Lote actual ({scannedBatch.length})
                </span>
              </div>
              <button
                onClick={handleClearBatch}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: '2px 6px',
                  borderRadius: 4,
                  transition: 'color 150ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
              >
                Limpiar lote
              </button>
            </div>

            {/* Scrollable list of cards in batch */}
            <div
              style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollbarWidth: 'none',
              }}
            >
              {scannedBatch.map((item, idx) => {
                const card = item.card!;
                return (
                  <div
                    key={`${card.id}-${idx}`}
                    style={{
                      position: 'relative',
                      flexShrink: 0,
                      borderRadius: 8,
                      overflow: 'visible',
                      animation: 'popIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    <TcgCardImage card={card} width={50} />
                    <button
                      onClick={() => handleRemoveFromBatch(card.id)}
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: '#FF3B30',
                        border: '1.5px solid #14161e',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 9,
                        fontWeight: 900,
                      }}
                      title="Eliminar del lote"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveBatch}
              style={{
                width: '100%',
                padding: '11px',
                background: 'linear-gradient(135deg, var(--accent) 0%, #E07A25 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: -0.1,
                boxShadow: '0 4px 16px rgba(242, 153, 74, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 200ms',
              }}
            >
              <span>📥 Guardar Lote en Biblioteca</span>
            </button>
          </div>
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
                onClick={() => handleSetScanLanguage(lang)}
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
          style={controlBtn(false)}
          onClick={openFilePicker}
          aria-label="Subir imagen desde galería o cámara"
        >
          <GalleryIcon size={20} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>Galería</span>
        </button>

        <button
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

        <button onClick={() => setFlash((f) => !f)} style={controlBtn(flash)}>
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

/* ------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* ------------------------------------------------------------------------- */

function DarkPillButton({
  children,
  onClick,
  active,
  activeColor = '#FFD60A',
  aria,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
  aria?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        background: active ? activeColor : 'rgba(255,255,255,0.10)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '0.5px solid rgba(255,255,255,0.15)',
        color: active ? 'var(--scanner-bg)' : '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function ScanBrackets({ state }: { state: ScanState }) {
  const color =
    state === 'scanning'
      ? 'var(--accent)'
      : state === 'detected'
        ? 'var(--success)'
        : '#fff';
  interface Corner {
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
    borderTop?: boolean;
    borderLeft?: boolean;
    borderRight?: boolean;
    borderBottom?: boolean;
    brtl?: number;
    brtr?: number;
    brbl?: number;
    brbr?: number;
  }
  const corners: Corner[] = [
    { top: 0, left: 0, borderTop: true, borderLeft: true, brtl: 14 },
    { top: 0, right: 0, borderTop: true, borderRight: true, brtr: 14 },
    { bottom: 0, left: 0, borderBottom: true, borderLeft: true, brbl: 14 },
    { bottom: 0, right: 0, borderBottom: true, borderRight: true, brbr: 14 },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        inset: '20px 50px',
        pointerEvents: 'none',
        transition: 'all 220ms',
        animation: state === 'scanning' ? 'pulseBracket 1s ease-in-out infinite' : 'none',
      }}
    >
      {corners.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 26,
            height: 26,
            top: c.top,
            left: c.left,
            right: c.right,
            bottom: c.bottom,
            borderTop: c.borderTop ? `3px solid ${color}` : undefined,
            borderLeft: c.borderLeft ? `3px solid ${color}` : undefined,
            borderRight: c.borderRight ? `3px solid ${color}` : undefined,
            borderBottom: c.borderBottom ? `3px solid ${color}` : undefined,
            borderTopLeftRadius: c.brtl,
            borderTopRightRadius: c.brtr,
            borderBottomLeftRadius: c.brbl,
            borderBottomRightRadius: c.brbr,
            boxShadow: state === 'detected' ? `0 0 24px ${color}88` : 'none',
            transition: 'border-color 200ms ease, box-shadow 200ms ease',
          }}
        />
      ))}
      
      {state === 'scanning' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 3,
            background: 'linear-gradient(90deg, rgba(47, 111, 224, 0) 0%, #2F6FE0 50%, rgba(47, 111, 224, 0) 100%)',
            boxShadow: '0 0 10px #2F6FE0, 0 0 4px #2F6FE0',
            animation: 'scanLine 2.2s linear infinite',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
}

function IdleHint({ cameraStatus, isMulticardMode }: { cameraStatus: CameraStatus; isMulticardMode?: boolean }) {
  const { icon, text } = (() => {
    if (cameraStatus === 'live') {
      return {
        icon: '🎯',
        text: isMulticardMode 
          ? 'Coloca múltiples cartas en el visor y presiona capturar.' 
          : 'Alinea la carta dentro del marco y toca capturar.',
      };
    }
    if (cameraStatus === 'starting') {
      return {
        icon: '📷',
        text: 'Iniciando cámara…',
      };
    }
    if (cameraStatus === 'denied') {
      return {
        icon: '🔒',
        text: 'Sin permiso de cámara. Usa Galería para subir una foto.',
      };
    }
    if (cameraStatus === 'unsupported') {
      return {
        icon: '📁',
        text: 'Cámara no disponible. Usa Galería para subir una foto.',
      };
    }
    if (cameraStatus === 'error') {
      return {
        icon: '⚠️',
        text: 'No se pudo abrir la cámara. Usa Galería como alternativa.',
      };
    }
    return {
      icon: '💡',
      text: 'Asegura buena iluminación y mantén la carta plana.',
    };
  })();
  return (
    <div
      style={{
        background: 'rgba(20,22,30,0.55)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: 18,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: -0.1,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function MulticardDetectedPanel({
  detectedCards,
  onSave,
  onRetry,
}: {
  detectedCards: PokemonCard[];
  onSave: () => void;
  onRetry: () => void;
}) {
  const totalValue = detectedCards.reduce((sum, card) => sum + (getEstimatedPrice(card)?.value ?? 0), 0);
  
  return (
    <div
      style={{
        background: 'rgba(20,22,30,0.75)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 22,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        animation: 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#2F6FE0',
              boxShadow: '0 0 8px #2F6FE0',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>
            Escaneo simultáneo exitoso ({detectedCards.length} cartas)
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--success)',
            background: 'rgba(52, 199, 89, 0.12)',
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          Total: {formatPriceShort({ value: totalValue, currency: 'USD', source: 'Total', provider: 'tcgplayer', tier: 'total' })}
        </div>
      </div>

      {/* List of cards */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {detectedCards.map((card, idx) => {
          const price = getEstimatedPrice(card);
          return (
            <div
              key={`${card.id}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '0.5px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                padding: 8,
                flexShrink: 0,
                minWidth: 150,
                animation: 'popIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <TcgCardImage card={card} width={42} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 90,
                  }}
                >
                  {card.name}
                </div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                  {card.set?.name ?? '—'} · {card.number}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--success)', marginTop: 2 }}>
                  {formatPriceShort(price)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onRetry}
          style={{
            padding: '10px 16px',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: -0.1,
          }}
        >
          Reintentar
        </button>
        <button
          onClick={onSave}
          style={{
            flex: 1,
            padding: '10px',
            background: 'linear-gradient(135deg, #7B5AD9 0%, #2F6FE0 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: -0.1,
            boxShadow: '0 4px 16px rgba(47, 111, 224, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 200ms',
          }}
        >
          <span>📥 Guardar todas en mi Biblioteca</span>
        </button>
      </div>
    </div>
  );
}

function ScanningPanel({ confidence }: { confidence: number }) {
  return (
    <div
      style={{
        background: 'rgba(20,22,30,0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 22,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>Analizando…</span>
        <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
          {confidence}%
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${confidence}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent), #34C759)',
            borderRadius: 999,
            transition: 'width 120ms',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 12,
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
        }}
      >
        <span>◐ Buscando bordes</span>
        <span>◆ Comparando arte</span>
        <span>◫ Leyendo número</span>
      </div>
    </div>
  );
}

function DetectedPanel({
  result,
  confidence,
  onView,
  onWrong,
}: {
  result: RecognitionResult;
  confidence: number;
  onView: () => void;
  onWrong: () => void;
}) {
  const card = result.card!;
  const isOffline = result.source === 'offline_fallback';
  const matchColor = isOffline ? '#FF9500' : 'var(--success)';
  const price = getEstimatedPrice(card);
  const categoryColor =
    result.cardCategory === 'Pokémon'
      ? '#34C759'
      : result.cardCategory === 'Trainer'
        ? '#F2994A'
        : result.cardCategory === 'Energy'
          ? '#7B5AD9'
          : '#8E8E93';
  return (
    <div
      style={{
        background: 'rgba(20,22,30,0.7)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 22,
        padding: 14,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      <TcgCardImage card={card} width={78} />
      <div style={{ flex: 1, paddingTop: 2, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: matchColor,
                boxShadow: `0 0 8px ${matchColor}`,
              }}
            />
            <span
              style={{
                fontSize: 10.5,
                color: matchColor,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
              }}
            >
              {isOffline ? 'Modo Offline' : `Coincidencia ${confidence}%`}
            </span>
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 999,
              color: categoryColor,
              background: categoryColor + '24',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            {result.cardCategory}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: -0.3,
              maxWidth: 140,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {card.name}
          </span>
          <RarityBadge rarity={card.rarity} />
        </div>

        {/* Pokémon types row */}
        {result.cardCategory === 'Pokémon' && result.pokemonTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {result.pokemonTypes.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.85)',
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginTop: 6,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 500,
              }}
            >
              Valor estimado
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: 'var(--success)',
                letterSpacing: -0.3,
              }}
            >
              {formatPriceShort(price)}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 500,
              }}
            >
              {result.number ? `Nº ${result.number}` : 'Expansión'}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                maxWidth: 130,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {result.possibleSetName ?? card.set?.name ?? '—'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={onWrong}
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: '0.5px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: -0.1,
            }}
          >
            No es esta
          </button>
          <button
            onClick={onView}
            style={{
              flex: 1,
              padding: '8px',
              background: '#fff',
              color: 'var(--scanner-bg)',
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: -0.1,
            }}
          >
            Ver detalle
          </button>
        </div>
        {result.simulated && (
          <div
            style={{
              marginTop: 8,
              fontSize: 10,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: 0.1,
            }}
          >
            Resultado simulado · escáner real en próxima versión
          </div>
        )}
        {result.source === 'offline_fallback' && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(255, 149, 0, 0.12)',
              border: '0.5px solid rgba(255, 149, 0, 0.3)',
              fontSize: 10.5,
              fontWeight: 600,
              color: '#FF9500',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              letterSpacing: 0.1,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#FF9500',
                boxShadow: '0 0 6px #FF9500',
                display: 'inline-block',
              }}
            />
            Modo Offline · Coincidencia local aproximada
          </div>
        )}
      </div>
    </div>
  );
}

function GradingDetectedPanel({
  gradingResult,
  onRetry,
}: {
  gradingResult: any;
  onRetry: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const cardObj = gradingResult.cardObj;

  const handleSaveWithGrade = () => {
    if (!cardObj) return;
    saveCardMeta(cardObj.id, {
      owned: true,
      condition: gradingResult.qualifier as any,
      customGrade: gradingResult.overallGrade,
      customGradeReport: gradingResult.issues.join('\n'),
    });
    setSaved(true);
    triggerHaptic('success');
  };

  const getSubGradeColor = (val: number) => {
    if (val >= 9.0) return '#34C759';
    if (val >= 7.5) return '#FF9500';
    return '#FF3B30';
  };

  return (
    <div
      style={{
        background: 'rgba(20,22,30,0.85)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 24,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        maxWidth: 420,
        margin: '0 auto',
        width: '100%',
        color: '#fff',
      }}
    >
      {/* Header Info */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {cardObj ? (
          <div style={{ width: 50, height: 70, borderRadius: 6, overflow: 'hidden', background: '#111', flexShrink: 0 }}>
            <img src={cardObj.images?.small} alt={cardObj.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{ width: 50, height: 70, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            🃏
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#FF9500', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>
            ✦ Certificado de Calificación IA
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {gradingResult.cardName}
          </div>
          {cardObj && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
              {cardObj.set?.name} · {cardObj.number}
            </div>
          )}
        </div>
      </div>

      {/* Main Grade Badge Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.03)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '12px 16px',
        gap: 16
      }}>
        {/* Holographic score circle */}
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FF9500 0%, #FF2D55 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(255, 149, 0, 0.4)',
          flexShrink: 0
        }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{gradingResult.overallGrade.toFixed(1)}</span>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Calificación General</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#FF9500', letterSpacing: -0.2 }}>
            PSA {Math.round(gradingResult.overallGrade)} <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>({gradingResult.qualifier})</span>
          </div>
        </div>
      </div>

      {/* Subgrades grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        background: 'rgba(255,255,255,0.01)',
      }}>
        {[
          { label: 'Centrado', value: gradingResult.centering },
          { label: 'Esquinas', value: gradingResult.corners },
          { label: 'Bordes', value: gradingResult.edges },
          { label: 'Superficie', value: gradingResult.surface },
        ].map((sub) => (
          <div key={sub.label} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{sub.label}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: getSubGradeColor(sub.value) }}>{sub.value.toFixed(1)}</span>
            </div>
            {/* mini progress bar */}
            <div style={{ height: 4, width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${sub.value * 10}%`,
                background: getSubGradeColor(sub.value),
                borderRadius: 2
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Issues detected list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 0.2 }}>
          DETALLES Y ANOMALÍAS DETECTADAS:
        </div>
        <div style={{
          maxHeight: 80,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          {gradingResult.issues && gradingResult.issues.length > 0 ? (
            gradingResult.issues.map((issue: string, index: number) => (
              <div key={index} style={{
                display: 'flex',
                gap: 8,
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.85)',
                lineHeight: 1.3
              }}>
                <span style={{ color: '#FF3B30' }}>•</span>
                <span>{issue}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11.5, color: '#34C759', fontWeight: 600 }}>
              ✓ Ninguna imperfección visible en superficie, bordes ni esquinas.
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={onRetry}
          style={{
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Escanear otra
        </button>
        {cardObj && (
          <button
            onClick={handleSaveWithGrade}
            disabled={saved}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: saved ? 'rgba(52, 199, 89, 0.2)' : '#fff',
              color: saved ? '#34C759' : 'var(--scanner-bg)',
              border: saved ? '1px solid #34C759' : 'none',
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: saved ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            {saved ? '✓ Guardada con éxito' : 'Guardar con Calificación'}
          </button>
        )}
      </div>
    </div>
  );
}

function LowConfidencePanel({
  onRetry,
  onManual,
  message,
}: {
  onRetry: () => void;
  onManual: () => void;
  message?: string | null;
}) {
  return (
    <div
      style={{
        background: 'rgba(40,15,15,0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '0.5px solid rgba(255,80,80,0.25)',
        borderRadius: 22,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: 'rgba(255,69,58,0.18)',
            color: '#FF6B61',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <InfoIcon size={16} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Detección poco fiable</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            {message ?? 'Coincidencia baja · necesitamos al menos 70%'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={onRetry}
          style={{
            flex: 1,
            padding: '10px',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
        <button
          onClick={onManual}
          style={{
            flex: 1,
            padding: '10px',
            background: '#fff',
            color: 'var(--scanner-bg)',
            border: 'none',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Buscar manual
        </button>
      </div>
    </div>
  );
}

function CorrectionSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (card: PokemonCard) => void;
}) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 280);
  const [results, setResults] = useState<PokemonCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults([]);
      setErr(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setErr(null);
    searchCards({ name: debounced, pageSize: 12 })
      .then((res) => {
        if (id !== reqId.current) return;
        setResults(res.data);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setErr(e instanceof Error ? e.message : 'Error al buscar cartas');
        setResults([]);
      })
      .finally(() => {
        if (id !== reqId.current) return;
        setLoading(false);
      });
  }, [debounced]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 220ms ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#15171E',
          color: '#fff',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: '14px 18px 30px',
          animation: 'slideUp 280ms cubic-bezier(.2,.8,.2,1)',
          maxHeight: '70%',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 999,
            margin: '0 auto 14px',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>
            Buscar carta
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
        </div>
        <div
          style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <SearchIcon size={16} color="rgba(255,255,255,0.55)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre del Pokémon…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 14,
              outline: 'none',
            }}
            autoFocus
          />
        </div>
        {loading && (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 13,
            }}
          >
            Buscando…
          </div>
        )}
        {err && (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              color: '#FF6B61',
              fontSize: 13,
            }}
          >
            {err}
          </div>
        )}
        {!loading && !err && !debounced && (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 13,
            }}
          >
            Escribe el nombre del Pokémon para buscar
          </div>
        )}
        {!loading && !err && debounced && results.length === 0 && (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 13,
            }}
          >
            Sin resultados para “{debounced}”
          </div>
        )}
        {results.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
            }}
          >
            {results.map((c) => (
              <div
                key={c.id}
                onClick={() => onPick(c)}
                style={{ cursor: 'pointer' }}
              >
                <TcgCardImage card={c} width={92} />
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    marginTop: 6,
                    color: 'rgba(255,255,255,0.9)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.5)',
                  }}
                >
                  {c.set?.name ?? '—'} · {c.number}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
