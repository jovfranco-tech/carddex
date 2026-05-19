import { useState, type CSSProperties } from 'react';
import type { PokemonCard } from '@/types/pokemon';

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
 * Renders a Pokémon TCG card image at a fixed 5:7 aspect ratio. Falls back to a
 * generated placeholder if no image is available (or if the network image
 * fails).
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
  const initialSrc = useLarge ? card.images?.large ?? card.images?.small : card.images?.small ?? card.images?.large;
  const [src, setSrc] = useState<string | undefined>(initialSrc);
  const [errored, setErrored] = useState(false);

  const height = width * 1.4; // 5:7 ratio
  const radius = Math.max(6, width * 0.05);

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
    ...style,
  };

  return (
    <div style={wrapperStyle} onClick={onClick} aria-label={card.name}>
      {src && !errored ? (
        <img
          src={src}
          alt={card.name}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => {
            // Try fallback to the other image size before giving up.
            const fallback =
              src === card.images?.large ? card.images?.small : card.images?.large;
            if (fallback && fallback !== src) {
              setSrc(fallback);
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

function Placeholder({ card, width }: { card: PokemonCard; width: number }) {
  const hue = hashHue(card.id || card.name);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `linear-gradient(155deg, hsl(${hue} 60% 78%), hsl(${(hue + 40) % 360} 50% 38%))`,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: width * 0.08,
        textAlign: 'center',
        fontFamily: 'var(--font-display)',
      }}
    >
      <div style={{ fontSize: width * 0.4, fontWeight: 800, lineHeight: 1 }}>
        {(card.name || '?')[0]?.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: Math.max(9, width * 0.08),
          marginTop: 8,
          fontWeight: 600,
          letterSpacing: 0.2,
          opacity: 0.9,
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
