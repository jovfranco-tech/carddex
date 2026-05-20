interface ScanningPanelProps {
  confidence: number;
}

export default function ScanningPanel({ confidence }: ScanningPanelProps) {
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
