interface ScanControlsBarProps {
  scanMode: 'single' | 'batch' | 'multicard' | 'grading';
  onSetScanMode: (mode: 'single' | 'batch' | 'multicard' | 'grading') => void;
}

export default function ScanControlsBar({
  scanMode,
  onSetScanMode,
}: ScanControlsBarProps) {
  return (
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
        onClick={() => onSetScanMode('single')}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: 'none',
          background:
            scanMode === 'single' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
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
        onClick={() => onSetScanMode('batch')}
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
        onClick={() => onSetScanMode('multicard')}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: 'none',
          background:
            scanMode === 'multicard'
              ? 'linear-gradient(135deg, #7B5AD9 0%, #2F6FE0 100%)'
              : 'transparent',
          color:
            scanMode === 'multicard' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
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
        onClick={() => onSetScanMode('grading')}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: 'none',
          background:
            scanMode === 'grading'
              ? 'linear-gradient(135deg, #FF9500 0%, #FF2D55 100%)'
              : 'transparent',
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
  );
}
