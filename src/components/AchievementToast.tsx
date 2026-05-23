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
            {[...Array(32)].map((_, i) => {
              const angle = (i * (360 / 32) * Math.PI) / 180;
              const distance = 25 + (i % 3) * 20;
              const tx = Math.cos(angle) * distance;
              const ty = Math.sin(angle) * distance - 8;
              const rot = i * 45;
              const width = 4 + (i % 3) * 2;
              const height = 4 + (i % 2 === 0 ? 2 : 5);
              const color = [
                '#FFD700',
                '#FF6B6B',
                '#4ECDC4',
                '#FFE66D',
                '#A8E063',
                '#F7797D',
                '#C3E88D',
                '#E0C3FC',
              ][i % 8];
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    width,
                    height,
                    borderRadius: i % 2 === 0 ? '50%' : '1px',
                    background: color,
                    left: 32, // pop from behind trophy emoji
                    top: '50%',
                    transformOrigin: 'center',
                    animation: `popConfettiOut 1s cubic-bezier(0.1, 0.8, 0.3, 1) ${i * 10}ms both`,
                    ['--tx' as any]: `${tx}px`,
                    ['--ty' as any]: `${ty}px`,
                    ['--rot' as any]: `${rot}deg`,
                  }}
                />
              );
            })}
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
        @keyframes popConfettiOut {
          0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 1; }
          15% { transform: translate(var(--tx), var(--ty)) scale(1.2) rotate(var(--rot)); opacity: 1; }
          100% { transform: translate(calc(var(--tx) * 1.4), calc(var(--ty) * 1.4 + 15px)) scale(0.4) rotate(calc(var(--rot) * 2.5)); opacity: 0; }
        }
      `}</style>
    </>
  );
}
