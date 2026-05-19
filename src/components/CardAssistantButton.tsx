import { useState } from 'react';
import CardAssistantSheet from './CardAssistantSheet';
import type { CardAssistantContext } from '@/lib/cardAssistant';

export interface CardAssistantButtonProps {
  context: CardAssistantContext | null;
  /** When false, the button is disabled (e.g. while the card is loading). */
  enabled?: boolean;
}

/**
 * Pill-style entry button + the bottom sheet it opens. Placed near the
 * add-to-collection panel on the Detail screen.
 */
export default function CardAssistantButton({
  context,
  enabled = true,
}: CardAssistantButtonProps) {
  const [open, setOpen] = useState(false);
  const disabled = !enabled || !context;

  return (
    <>
      <button
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label="Preguntar al asistente sobre esta carta"
        style={{
          width: '100%',
          padding: '12px 14px',
          border: '0.5px solid var(--border)',
          background: 'var(--surface)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontFamily: 'inherit',
          cursor: disabled ? 'default' : 'pointer',
          textAlign: 'left',
          opacity: disabled ? 0.5 : 1,
          boxShadow: 'var(--shadow-1)',
          transition: 'transform 120ms, box-shadow 200ms',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            background: 'var(--accent-tint)',
            color: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 17,
            fontWeight: 800,
          }}
        >
          ✦
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: -0.2,
            }}
          >
            Preguntar a IA
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--muted)',
              marginTop: 2,
            }}
          >
            Rareza, valor, ataques, variantes…
          </span>
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 18,
            color: 'var(--accent)',
            fontWeight: 700,
          }}
        >
          ›
        </span>
      </button>
      <CardAssistantSheet
        open={open}
        onClose={() => setOpen(false)}
        context={context}
      />
    </>
  );
}
