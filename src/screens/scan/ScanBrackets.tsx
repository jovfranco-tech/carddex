import type { ScanState } from '../ScanScreen';

interface ScanBracketsProps {
  state: ScanState;
  isAligned?: boolean;
}

export default function ScanBrackets({ state, isAligned }: ScanBracketsProps) {
  const color =
    state === 'scanning'
      ? 'var(--accent)'
      : state === 'detected' || isAligned
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
            boxShadow: state === 'detected' || isAligned ? `0 0 24px ${color}88` : 'none',
            transition: 'border-color 200ms ease, box-shadow 200ms ease',
          }}
        />
      ))}
      
      {state === 'scanning' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 3,
            background: 'linear-gradient(90deg, rgba(47, 111, 224, 0) 0%, #2F6FE0 50%, rgba(47, 111, 224, 0) 100%)',
            boxShadow: '0 0 10px #2F6FE0, 0 0 4px #2F6FE0',
            animation: 'scanLine 2.2s linear infinite',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
}
