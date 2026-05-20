import React from 'react';

interface DarkPillButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
  aria?: string;
}

export default function DarkPillButton({
  children,
  onClick,
  active,
  activeColor = '#FFD60A',
  aria,
}: DarkPillButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        background: active ? activeColor : 'rgba(255,255,255,0.10)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '0.5px solid rgba(255,255,255,0.15)',
        color: active ? 'var(--scanner-bg)' : '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}
