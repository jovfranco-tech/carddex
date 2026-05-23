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
          ? 'Coloca múltiples cartas en el visor. Este modo es prototipo asistido.'
          : 'Alinea la carta y toca capturar. La cámara no guarda video.',
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
        text: 'Permiso de cámara denegado. Puedes usar Galería o búsqueda manual.',
      };
    }
    if (cameraStatus === 'unsupported') {
      return {
        icon: '📁',
        text: 'Cámara no disponible en este dispositivo. Usa Galería o búsqueda manual.',
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
        letterSpacing: 0,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
