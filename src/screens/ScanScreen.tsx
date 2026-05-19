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
} from '@/lib/cardRecognition';
import type { PokemonCard } from '@/types/pokemon';

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

export default function ScanScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<ScanState>('idle');
  const [flash, setFlash] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [blurWarning, setBlurWarning] = useState(false);

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
      const recognition = await recognizeCardFromImage(input);

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
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // Error vibration pattern
        return;
      }

      setConfidence(Math.round(recognition.confidence * 100));
      setResult(recognition);
      setState('detected');
      if (navigator.vibrate) navigator.vibrate(100); // Success vibration
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
  }, []);

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
      if (navigator.vibrate) navigator.vibrate(50);
      return;
    }
    if (state === 'scanning') return;
    
    if (navigator.vibrate) navigator.vibrate(50); // Tap vibration
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
          {state === 'idle' && 'Toma una foto de la carta'}
          {state === 'scanning' && 'Identificando carta…'}
          {state === 'detected' && '¡Carta detectada!'}
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
          {state === 'idle' && 'Alinea la carta dentro del marco'}
          {state === 'scanning' && 'Mantén la cámara estable'}
          {state === 'detected' && 'Revisa los detalles antes de guardar'}
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

          {/* Ambient light glow behind the card guide when detected */}
          {state === 'detected' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at center, rgba(52, 199, 89, 0.15) 0%, transparent 60%)',
                zIndex: 2,
                pointerEvents: 'none',
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
        </div>

        {/* corner brackets */}
        <ScanBrackets state={state} />

        {/* card preview — appears once scanning starts */}
        {state !== 'idle' && result?.card && (
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
        {state === 'scanning' && !result?.card && (
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
        {state === 'idle' && (
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
        {state === 'idle' && <IdleHint cameraStatus={cameraStatus} />}
        {state === 'scanning' && <ScanningPanel confidence={confidence} />}
        {state === 'detected' && result?.card && (
          <DetectedPanel
            result={result}
            confidence={confidence}
            onView={() =>
              navigate(`/card/${encodeURIComponent(result.card!.id)}`)
            }
            onWrong={() => setCorrectOpen(true)}
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
    </div>
  );
}

function IdleHint({ cameraStatus }: { cameraStatus: CameraStatus }) {
  const { icon, text } = (() => {
    if (cameraStatus === 'live') {
      return {
        icon: '🎯',
        text: 'Alinea la carta dentro del marco y toca capturar.',
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
                background: 'var(--success)',
                boxShadow: '0 0 8px var(--success)',
              }}
            />
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--success)',
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
              }}
            >
              Coincidencia {confidence}%
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
