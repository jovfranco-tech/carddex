import { type ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Use a larger illustration block for primary screens. */
  large?: boolean;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  large = false,
}: EmptyStateProps) {
  return (
    <div
      style={{
        padding: large ? '24px 24px 40px' : '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {icon && (
        <div
          style={{
            width: large ? 92 : 80,
            height: large ? 92 : 80,
            borderRadius: large ? 28 : 24,
            background: 'var(--accent-tint)',
            color: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: large ? 18 : 16,
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          margin: 0,
          fontSize: large ? 19 : 18,
          fontWeight: 800,
          color: 'var(--ink)',
          letterSpacing: -0.4,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--muted)',
            maxWidth: 280,
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}
