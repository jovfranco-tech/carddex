export interface LoadingStateProps {
  message?: string;
  /** Render a 5:7 grid skeleton instead of a spinner. */
  variant?: 'spinner' | 'grid' | 'inline';
  /** Number of skeleton tiles to render when variant=grid. */
  count?: number;
  /** Skeleton grid columns. */
  columns?: number;
}

export default function LoadingState({
  message,
  variant = 'spinner',
  count = 9,
  columns = 3,
}: LoadingStateProps) {
  if (variant === 'grid') {
    return (
      <div
        style={{
          padding: '0 18px',
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 12,
        }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '5 / 7',
              borderRadius: 8,
              background: 'linear-gradient(110deg, #EAECF1 8%, #F2F4F7 18%, #EAECF1 33%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s linear infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div style={{ padding: 14, fontSize: 13, color: 'var(--muted)' }}>
        {message ?? 'Cargando…'}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        color: 'var(--muted)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '3px solid #E1E3EA',
          borderTopColor: 'var(--accent)',
          animation: 'spin 0.9s linear infinite',
        }}
      />
      <span style={{ fontSize: 13 }}>{message ?? 'Cargando…'}</span>
    </div>
  );
}
