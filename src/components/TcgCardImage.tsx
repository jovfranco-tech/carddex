import { useState, useEffect, type CSSProperties } from 'react';
import type { PokemonCard } from '@/types/pokemon';
import { getOptimizedImageUrl } from '@/lib/imageOptimization';

export interface TcgCardImageProps {
  card: PokemonCard;
  width?: number;
  /** Prefer the large image (default true for sizes >= 160). */
  large?: boolean;
  /** Optional click handler — adds pointer cursor when present. */
  onClick?: () => void;
  /** Custom style merged into the wrapper. */
  style?: CSSProperties;
  /** Apply a subtle drop shadow appropriate for hero placements. */
  hero?: boolean;
}

/**
 * Checks if the given card rarity is typically holographic/secret/ultra.
 */
function isHolographic(rarity: string | undefined): boolean {
  if (!rarity) return false;
  const lower = rarity.toLowerCase();
  return (
    lower.includes('holo') ||
    lower.includes('secret') ||
    lower.includes('ultra') ||
    lower.includes('shiny') ||
    lower.includes('rainbow') ||
    lower.includes('promo') ||
    lower.includes('illustration') ||
    lower.includes('hyper') ||
    lower.includes('gold') ||
    lower.includes('rare sh') ||
    lower.includes('gallery')
  );
}

/**
 * Renders a Pokémon TCG card image at a fixed 5:7 aspect ratio.
 * Incorporates a premium, mouse-tilt and gyroscope-based 3D holographic foil effect
 * for Holo, Secret Rare, and special cards.
 */
export default function TcgCardImage({
  card,
  width = 110,
  large,
  onClick,
  style,
  hero,
}: TcgCardImageProps) {
  const useLarge = large ?? width >= 160;
  const initialRawSrc = useLarge ? card.images?.large ?? card.images?.small : card.images?.small ?? card.images?.large;
  const [src, setSrc] = useState<string | undefined>(() => getOptimizedImageUrl(initialRawSrc, width));
  const [hasTriedFallback, setHasTriedFallback] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const rawSrc = useLarge ? card.images?.large ?? card.images?.small : card.images?.small ?? card.images?.large;
    setSrc(getOptimizedImageUrl(rawSrc, width));
    setErrored(false);
    setHasTriedFallback(false);
  }, [card.images?.large, card.images?.small, useLarge, width]);

  // 3D holographic rotation states
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [holoPos, setHoloPos] = useState({ x: 50, y: 50 });
  const [active, setActive] = useState(false);

  const isHolo = isHolographic(card.rarity);
  const isRainbow = card.rarity?.toLowerCase().includes('rainbow') ||
                    card.rarity?.toLowerCase().includes('secret') ||
                    card.rarity?.toLowerCase().includes('hyper');

  const height = width * 1.4; // 5:7 ratio
  const radius = Math.max(6, width * 0.05);

  // Responsive device orientation (gyroscope) for mobile
  useEffect(() => {
    if (!isHolo || !large) return;

    let requestScheduled = false;
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (requestScheduled) return;
      requestScheduled = true;
      
      requestAnimationFrame(() => {
        requestScheduled = false;
        if (e.beta === null || e.gamma === null) return;

        // Resting tilt reference: hold at 45 deg, gamma 0
        const betaDelta = e.beta - 45;
        const gammaDelta = e.gamma;

        const maxRotate = 15;
        const rx = Math.max(-maxRotate, Math.min(maxRotate, -betaDelta * 0.4));
        const ry = Math.max(-maxRotate, Math.min(maxRotate, gammaDelta * 0.4));

        setRotate({ x: rx, y: ry });
        
        // Map degrees to gradient coordinates (0% to 100%)
        const hx = ((gammaDelta + 25) / 50) * 100;
        const hy = ((betaDelta + 25) / 50) * 100;
        setHoloPos({
          x: Math.max(0, Math.min(100, hx)),
          y: Math.max(0, Math.min(100, hy)),
        });
        setActive(true);
      });
    };

    // Auto-activate or listen
    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isHolo, large]);

  // Desktop Hover handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHolo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const px = x / rect.width - 0.5;
    const py = y / rect.height - 0.5;

    // Apply rotation tilt limits
    setRotate({
      x: -py * 20,
      y: px * 20,
    });

    setHoloPos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    });
  };

  const handleMouseEnter = () => {
    if (!isHolo) return;
    setActive(true);
  };

  const handleMouseLeave = () => {
    if (!isHolo) return;
    setActive(false);
    setRotate({ x: 0, y: 0 });
  };

  // Base styling with 3D transform support
  const tiltStyle: CSSProperties = isHolo
    ? {
        transform: `perspective(1000px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
        transition: active
          ? 'transform 0.05s linear'
          : 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
        transformStyle: 'preserve-3d',
      }
    : {};

  const wrapperStyle: CSSProperties = {
    width,
    height,
    borderRadius: radius,
    overflow: 'hidden',
    flexShrink: 0,
    background: '#EAECF1',
    boxShadow: hero
      ? '0 18px 28px rgba(15,20,40,0.18)'
      : '0 1px 2px rgba(15,20,40,0.06), 0 4px 12px rgba(15,20,40,0.08)',
    cursor: onClick ? 'pointer' : undefined,
    position: 'relative',
    ...tiltStyle,
    ...style,
  };

  // Tailored holographic gradient color map
  const holoColors = isRainbow
    ? {
        primary: 'rgba(255, 190, 225, 0.55)',
        secondary: 'rgba(120, 225, 255, 0.35)',
        accent: 'rgba(255, 225, 130, 0.35)',
      }
    : {
        primary: 'rgba(255, 255, 255, 0.45)',
        secondary: 'rgba(255, 220, 0, 0.2)',
        accent: 'rgba(0, 240, 255, 0.2)',
      };

  const holoOverlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    mixBlendMode: 'color-dodge',
    opacity: active ? 0.78 : 0,
    background: `
      linear-gradient(
        115deg,
        transparent 0%,
        ${holoColors.primary} ${holoPos.x}%,
        transparent 100%
      ),
      radial-gradient(
        circle at ${holoPos.x}% ${holoPos.y}%,
        ${holoColors.primary} 0%,
        ${holoColors.secondary} 32%,
        ${holoColors.accent} 55%,
        transparent 75%
      )
    `,
    pointerEvents: 'none',
    transition: 'opacity 0.25s ease',
  };

  return (
    <div
      style={wrapperStyle}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={card.name}
    >
      {/* Holographic overlay */}
      {isHolo && <div style={holoOverlayStyle} />}

      {src && !errored ? (
        <img
          src={src}
          alt={card.name}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            backfaceVisibility: 'hidden',
          }}
          onError={() => {
            if (!hasTriedFallback) {
              setHasTriedFallback(true);
              const fallbackRaw =
                initialRawSrc === card.images?.large ? card.images?.small : card.images?.large;
              if (fallbackRaw && fallbackRaw !== initialRawSrc) {
                setSrc(getOptimizedImageUrl(fallbackRaw, width));
              } else {
                setErrored(true);
              }
            } else {
              setErrored(true);
            }
          }}
        />
      ) : (
        <Placeholder card={card} width={width} />
      )}
    </div>
  );
}

const typeEmojis: Record<string, string> = {
  Fire: '🔥',
  Water: '💧',
  Grass: '🌿',
  Lightning: '⚡',
  Psychic: '🔮',
  Fighting: '👊',
  Darkness: '🌙',
  Metal: '⚙️',
  Dragon: '🐲',
  Colorless: '⭐',
  Fairy: '🌸',
};

const typeColors: Record<string, { start: string; end: string }> = {
  Fire: { start: 'hsl(0, 75%, 28%)', end: 'hsl(15, 80%, 12%)' },
  Water: { start: 'hsl(205, 80%, 25%)', end: 'hsl(220, 85%, 10%)' },
  Grass: { start: 'hsl(110, 70%, 20%)', end: 'hsl(130, 80%, 8%)' },
  Lightning: { start: 'hsl(48, 85%, 25%)', end: 'hsl(40, 90%, 12%)' },
  Psychic: { start: 'hsl(280, 65%, 25%)', end: 'hsl(295, 75%, 12%)' },
  Fighting: { start: 'hsl(25, 70%, 25%)', end: 'hsl(20, 80%, 12%)' },
  Darkness: { start: 'hsl(240, 40%, 12%)', end: 'hsl(255, 60%, 6%)' },
  Metal: { start: 'hsl(200, 15%, 35%)', end: 'hsl(210, 20%, 15%)' },
  Dragon: { start: 'hsl(35, 60%, 25%)', end: 'hsl(280, 50%, 12%)' },
  Fairy: { start: 'hsl(330, 75%, 30%)', end: 'hsl(345, 80%, 15%)' },
  Colorless: { start: 'hsl(210, 25%, 30%)', end: 'hsl(220, 30%, 12%)' },
};

function Placeholder({ card, width }: { card: PokemonCard; width: number }) {
  const height = width * 1.4;
  const isCustom = card.set?.id === 'custom' || card.subtypes?.includes('Custom');
  const firstType = card.types?.[0] || 'Colorless';
  const emoji = typeEmojis[firstType] || '⭐';
  const colors = typeColors[firstType] || typeColors.Colorless;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: isCustom
          ? `linear-gradient(155deg, ${colors.start} 0%, ${colors.end} 100%)`
          : 'linear-gradient(155deg, #1a2040 0%, #0d1329 60%, #1a2a50 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Card back decorative ring */}
      <div style={{
        position: 'absolute',
        width: width * 0.75,
        height: width * 0.75,
        borderRadius: '50%',
        border: `${Math.max(2, width * 0.03)}px solid rgba(255,255,255,0.08)`,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }} />
      <div style={{
        position: 'absolute',
        width: width * 0.55,
        height: width * 0.55,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.06) 0%, transparent 70%)',
        border: `${Math.max(1, width * 0.02)}px solid rgba(255,255,255,0.12)`,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }} />

      {isCustom ? (
        <div style={{
          position: 'absolute',
          width: width * 0.42,
          height: width * 0.42,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: width * 0.2,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        }}>
          {emoji}
        </div>
      ) : (
        <>
          {/* Pokéball upper half */}
          <div style={{
            position: 'absolute',
            width: width * 0.38,
            height: width * 0.19,
            borderRadius: `${width * 0.19}px ${width * 0.19}px 0 0`,
            background: 'rgba(220, 50, 50, 0.7)',
            top: `calc(50% - ${width * 0.19}px)`,
            left: '50%',
            transform: 'translateX(-50%)',
          }} />
          {/* Pokéball lower half */}
          <div style={{
            position: 'absolute',
            width: width * 0.38,
            height: width * 0.19,
            borderRadius: `0 0 ${width * 0.19}px ${width * 0.19}px`,
            background: 'rgba(240,240,240,0.15)',
            top: '50%',
            left: '50%',
            transform: 'translateX(-50%)',
          }} />
          {/* Pokéball divider */}
          <div style={{
            position: 'absolute',
            width: width * 0.38,
            height: Math.max(2, width * 0.025),
            background: 'rgba(255,255,255,0.3)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }} />
          {/* Pokéball center button */}
          <div style={{
            position: 'absolute',
            width: width * 0.1,
            height: width * 0.1,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.9)',
            border: `${Math.max(2, width * 0.02)}px solid rgba(255,255,255,0.5)`,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 8px rgba(255,255,255,0.4)',
          }} />
        </>
      )}

      {/* Card name at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: height * 0.06,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: Math.max(8, width * 0.075),
          fontWeight: 700,
          letterSpacing: 0.2,
          color: 'rgba(255,255,255,0.75)',
          padding: `0 ${width * 0.06}px`,
          lineHeight: 1.2,
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}
      >
        {card.name}
      </div>
    </div>
  );
}

function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) % 360;
  return h;
}
