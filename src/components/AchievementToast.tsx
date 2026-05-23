import { useEffect, useState, useRef } from 'react';
import type { Achievement } from '@/lib/achievements';

interface AchievementToastProps {
  achievement: Achievement | null;
  onDismiss: () => void;
}

/**
 * Premium glassmorphic toast that slides in from the top when a new
 * achievement is unlocked. Auto-dismisses after 4 seconds.
 */
export default function AchievementToast({ achievement, onDismiss }: AchievementToastProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!achievement) {
      setVisible(false);
      return;
    }

    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 350); // wait for exit animation
    }, 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [achievement]);

  if (!achievement && !visible) return null;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 0,
          left: '50%',
          transform: `translateX(-50%) translateY(${visible ? '12px' : '-120px'})`,
          transition: 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 99999,
          width: 'calc(100% - 32px)',
          maxWidth: 360,
          background:
            'linear-gradient(135deg, rgba(123,90,217,0.92) 0%, rgba(47,111,224,0.92) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 18,
          padding: '14px 16px',
          boxShadow: '0 8px 32px rgba(123,90,217,0.45), 0 0 0 0.5px rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Confetti burst particles */}
        {visible && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              borderRadius: 18,
              pointerEvents: 'none',
            }}
          >
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: [
                    '#FFD700',
                    '#FF6B6B',
                    '#4ECDC4',
                    '#FFE66D',
                    '#A8E063',
                    '#F7797D',
                    '#FFECD2',
                    '#C3E88D',
                  ][i],
                  left: `${10 + i * 12}%`,
                  top: '50%',
                  animation: `confettiPop${i % 4} 0.8s ease-out ${i * 60}ms both`,
                }}
              />
            ))}
          </div>
        )}

        {/* Emoji */}
        <div
          style={{
            fontSize: 34,
            lineHeight: 1,
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
            flexShrink: 0,
            animation: visible
              ? 'bounceEmoji 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both'
              : undefined,
          }}
        >
          {achievement?.emoji}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: 'rgba(255,255,255,0.7)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 2,
            }}
          >
            🏆 Logro Desbloqueado
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#fff',
              letterSpacing: -0.3,
              lineHeight: 1.2,
            }}
          >
            {achievement?.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.75)',
              marginTop: 2,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {achievement?.description}
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 350);
          }}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: 12,
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      <style>{`
        @keyframes bounceEmoji {
          from { transform: scale(0.5) rotate(-15deg); opacity: 0; }
          to   { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes confettiPop0 { to { transform: translate(-20px, -40px) rotate(120deg); opacity: 0; } }
        @keyframes confettiPop1 { to { transform: translate(20px, -50px) rotate(-80deg); opacity: 0; } }
        @keyframes confettiPop2 { to { transform: translate(-10px, -55px) rotate(200deg); opacity: 0; } }
        @keyframes confettiPop3 { to { transform: translate(30px, -35px) rotate(-150deg); opacity: 0; } }
      `}</style>
    </>
  );
}
