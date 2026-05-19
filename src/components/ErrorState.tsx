export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      style={{
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: 'rgba(255, 59, 48, 0.10)',
          color: 'var(--error)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
        }}
      >
        ⚠︎
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--ink)',
          letterSpacing: -0.2,
        }}
      >
        Algo salió mal
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', maxWidth: 280 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 4,
            padding: '10px 18px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: -0.1,
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
