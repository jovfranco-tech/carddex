export default function BlurWarningBanner() {
  return (
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
  );
}
