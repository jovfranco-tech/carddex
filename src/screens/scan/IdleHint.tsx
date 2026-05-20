import type { CameraStatus } from '../ScanScreen';

interface IdleHintProps {
  cameraStatus: CameraStatus;
  isMulticardMode?: boolean;
}

export default function IdleHint({ cameraStatus, isMulticardMode }: IdleHintProps) {
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
