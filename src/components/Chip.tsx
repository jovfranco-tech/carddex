import type { CSSProperties, ReactNode } from 'react';

export interface ChipProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  color?: string;
  style?: CSSProperties;
}

export default function Chip({ children, active, onClick, color, style }: ChipProps) {
  const composed: CSSProperties = {
    border: 'none',
    background: active ? (color ?? 'var(--accent)') : '#F2F3F7',
    color: active ? '#fff' : 'var(--ink-2)',
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 999,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 160ms ease',
    letterSpacing: -0.1,
    ...style,
  };
  return (
    <button type="button" onClick={onClick} style={composed}>
      {children}
    </button>
  );
}
