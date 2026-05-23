import { type ReactNode } from 'react';
import Surface from './Surface';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  suffix?: ReactNode;
  accent?: string;
  glyph?: ReactNode;
}

export default function StatCard({
  label,
  value,
  suffix,
  accent = '#2F80ED',
  glyph,
}: StatCardProps) {
  return (
    <Surface style={{ padding: 14, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: accent + '20',
            color: accent,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 800,
          }}
        >
          {glyph ?? '◆'}
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: -0.1, fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: -0.6,
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
        {suffix && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{suffix}</span>
        )}
      </div>
    </Surface>
  );
}
