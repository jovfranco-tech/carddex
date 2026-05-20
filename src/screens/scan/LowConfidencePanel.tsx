import { InfoIcon } from '@/components/icons';

interface LowConfidencePanelProps {
  onRetry: () => void;
  onManual: () => void;
  message?: string | null;
}

export default function LowConfidencePanel({
  onRetry,
  onManual,
  message,
}: LowConfidencePanelProps) {
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
