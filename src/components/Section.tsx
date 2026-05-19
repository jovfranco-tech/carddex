import { type ReactNode, useEffect, useRef, useState } from 'react';
import { CheckIcon } from './icons';

export interface SectionProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Reduce vertical margin. */
  tight?: boolean;
}

/** Section header wrapper. */
export function Section({ title, action, children, tight }: SectionProps) {
  return (
    <div style={{ marginBottom: tight ? 14 : 22 }}>
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '0 18px 10px',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: -0.3,
            }}
          >
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export interface ActionLinkProps {
  children: ReactNode;
  onClick?: () => void;
  color?: string;
}

export function ActionLink({ children, onClick, color }: ActionLinkProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'inherit',
        color: color ?? 'var(--accent)',
        padding: 0,
        cursor: 'pointer',
        letterSpacing: -0.1,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* Toast                                                                      */
/* ------------------------------------------------------------------------- */

export interface ToastProps {
  message: string;
  visible: boolean;
  onHide?: () => void;
  duration?: number;
}

export function Toast({ message, visible, onHide, duration = 1600 }: ToastProps) {
  const [show, setShow] = useState(visible);
  // Keep the latest onHide in a ref so re-renders don't restart the timer.
  // (Inline arrow callers — e.g. `onHide={() => setX(null)}` — change identity
  // every render, which previously cleared and re-armed the setTimeout.)
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  }, [onHide]);

  useEffect(() => {
    setShow(visible);
    if (!visible) return;
    const t = window.setTimeout(() => {
      setShow(false);
      onHideRef.current?.();
    }, duration);
    return () => window.clearTimeout(t);
  }, [visible, duration]);

  if (!show) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: 64,
        zIndex: 70,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        animation: 'toastIn 320ms cubic-bezier(.2,.8,.2,1)',
      }}
    >
      <div
        style={{
          background: 'var(--ink)',
          color: '#fff',
          padding: '10px 14px 10px 10px',
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 10px 30px rgba(15,20,40,0.25)',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: -0.1,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: 'var(--success)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon size={14} />
        </span>
        {message}
      </div>
    </div>
  );
}
