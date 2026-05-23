import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { triggerHaptic } from '@/lib/haptic';

const ONBOARDING_KEY = 'carddex.onboardingComplete';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = [
  {
    emoji: '🃏',
    title: '¡Bienvenido a CardDex!',
    description: 'Tu binder digital de Pokémon TCG para buscar, escanear y organizar cartas.',
    hint: 'El scanner es asistido/prototipo y funciona localmente en esta demo.',
    cta: 'Empezar',
  },
  {
    emoji: '📷',
    title: 'Escanea tus cartas',
    description:
      'Apunta la cámara a una carta para recibir sugerencias basadas en datos disponibles.',
    hint: 'También puedes buscar por nombre, revisar detalles y guardar cartas.',
    cta: 'Continuar',
  },
  {
    emoji: '✦',
    title: 'Asistente contextual',
    description:
      'Consulta datos de la carta, colección y precios disponibles sin prometer predicciones perfectas.',
    hint: 'CardDex está preparado para un LLM vía backend, sin keys expuestas en frontend.',
    cta: '¡Comenzar mi colección!',
  },
];

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const navigate = useNavigate();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (animating) return;
    triggerHaptic('light');

    if (isLast) {
      // Mark onboarding as complete
      try {
        localStorage.setItem(ONBOARDING_KEY, 'true');
      } catch {}
      onComplete();
      navigate('/scan');
      return;
    }

    setAnimating(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setAnimating(false);
    }, 180);
  };

  const handleSkip = () => {
    triggerHaptic('light');
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {}
    onComplete();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(160deg, #0d0f1a 0%, #12152b 60%, #0d0f1a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 28px',
        userSelect: 'none',
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(123,90,217,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Skip button */}
      {!isLast && (
        <button
          onClick={handleSkip}
          aria-label="Omitir onboarding"
          style={{
            position: 'absolute',
            top: 54,
            right: 24,
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Omitir
        </button>
      )}

      {/* Emoji illustration */}
      <div
        style={{
          fontSize: 72,
          marginBottom: 32,
          opacity: animating ? 0 : 1,
          transform: animating ? 'scale(0.8) translateY(10px)' : 'scale(1) translateY(0)',
          transition: 'all 180ms ease',
          filter: 'drop-shadow(0 0 24px rgba(123,90,217,0.4))',
        }}
      >
        {current.emoji}
      </div>

      {/* Text block */}
      <div
        style={{
          textAlign: 'center',
          maxWidth: 320,
          opacity: animating ? 0 : 1,
          transform: animating ? 'translateY(12px)' : 'translateY(0)',
          transition: 'all 200ms ease 20ms',
        }}
      >
        <h1
          style={{
            margin: '0 0 12px',
            fontSize: 26,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: 0,
            lineHeight: 1.15,
          }}
        >
          {current.title}
        </h1>
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 15,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.5,
            fontWeight: 400,
          }}
        >
          {current.description}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: 'rgba(255,255,255,0.35)',
            lineHeight: 1.4,
            fontStyle: 'italic',
          }}
        >
          {current.hint}
        </p>
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: 8, margin: '36px 0 24px' }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? 22 : 8,
              height: 8,
              borderRadius: 99,
              background:
                i === step ? 'linear-gradient(90deg, #7B5AD9, #2F6FE0)' : 'rgba(255,255,255,0.18)',
              transition: 'all 300ms ease',
            }}
          />
        ))}
      </div>

      {/* CTA Button */}
      <button
        onClick={handleNext}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: '15px 0',
          background: 'linear-gradient(135deg, #7B5AD9 0%, #2F6FE0 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 16,
          fontSize: 15,
          fontWeight: 800,
          fontFamily: 'inherit',
          cursor: 'pointer',
          boxShadow: '0 6px 24px rgba(123, 90, 217, 0.4)',
          letterSpacing: 0,
          transition: 'transform 120ms ease, box-shadow 120ms ease',
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'scale(0.97)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {current.cta}
      </button>
    </div>
  );
}

/**
 * Returns true if the onboarding has already been completed.
 */
export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return true; // Fail open — don't block the app
  }
}
