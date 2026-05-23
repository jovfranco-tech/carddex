import type { CSSProperties, ReactNode, MouseEvent } from 'react';

export interface SurfaceProps {
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'article' | 'button';
  /** Inline padding shortcut: numbers become px, strings pass through. */
  padding?: number | string;
}

/**
 * A white, rounded-card surface. The default visual block used throughout the app.
 */
export default function Surface({ children, onClick, style, as = 'div', padding }: SurfaceProps) {
  const Tag = as;
  const composed: CSSProperties = {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-1)',
    border: '0.5px solid var(--border-soft)',
    padding: padding != null ? padding : undefined,
    cursor: onClick ? 'pointer' : undefined,
    fontFamily: 'inherit',
    textAlign: 'inherit',
    ...style,
  };
  if (as === 'button') {
    return (
      <button type="button" style={composed} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <Tag style={composed} onClick={onClick}>
      {children}
    </Tag>
  );
}
