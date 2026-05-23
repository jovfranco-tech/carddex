export interface FoilToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

export default function FoilToggle({ value, onChange, label = 'Foil' }: FoilToggleProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flex: 1,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={`${label}: ${value ? 'activado' : 'desactivado'}`}
        onClick={() => onChange(!value)}
        style={{
          width: 46,
          height: 28,
          borderRadius: 999,
          padding: 2,
          background: value ? 'var(--success)' : '#E1E3EA',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 200ms',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transform: `translateX(${value ? 18 : 0}px)`,
            transition: 'transform 200ms',
          }}
        />
      </button>
    </div>
  );
}
