import type { PokemonCard } from '@/types/pokemon';
import type { CollectionCardMeta } from '@/types/collection';
import TcgCardImage from './TcgCardImage';
import { HeartFilledIcon, BookmarkIcon } from './icons';

export interface CardTileProps {
  card: PokemonCard;
  meta?: CollectionCardMeta;
  width?: number;
  onClick?: () => void;
  /** When true and meta says not owned, render a dashed "Falta" placeholder. */
  showMissingState?: boolean;
  /** Custom view transition identifier for fluid routing animations. */
  viewTransitionName?: string;
}

/**
 * A single card tile for use in grids and carousels. Renders the card image
 * and overlays for quantity badge, favorite heart, wishlist bookmark, plus an
 * optional "missing" treatment for owned-binders.
 */
export default function CardTile({
  card,
  meta,
  width = 104,
  onClick,
  showMissingState = false,
  viewTransitionName,
}: CardTileProps) {
  const owned = !!meta?.owned && (meta.quantity ?? 1) > 0;
  const treatMissing = showMissingState && !owned;

  return (
    <button
      type="button"
      className="scroll-reveal"
      onClick={onClick}
      aria-label={onClick ? `Ver detalle de ${card.name}` : card.name}
      tabIndex={onClick ? 0 : -1}
      style={{
        position: 'relative',
        display: 'block',
        background: 'transparent',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'transform 200ms',
        width,
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          filter: treatMissing ? 'grayscale(0.85) brightness(0.95) opacity(0.55)' : undefined,
          transition: 'filter 200ms',
        }}
      >
        <TcgCardImage card={card} width={width} viewTransitionName={viewTransitionName} />
      </div>

      {treatMissing && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px dashed rgba(15,20,40,0.2)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 8,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              background: 'var(--ink)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.3,
              padding: '3px 7px',
              borderRadius: 999,
              textTransform: 'uppercase',
            }}
          >
            Falta
          </span>
        </div>
      )}

      {owned && (meta?.quantity ?? 0) > 1 && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            minWidth: 22,
            height: 22,
            borderRadius: 999,
            padding: '0 6px',
            background: 'var(--ink)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
            border: '1.5px solid #fff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        >
          {meta?.quantity}
        </div>
      )}

      {meta?.favorite && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 22,
            height: 22,
            borderRadius: 999,
            background: '#fff',
            color: '#FF3B30',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          }}
        >
          <HeartFilledIcon size={12} />
        </div>
      )}

      {meta?.wishlist && !meta.favorite && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 22,
            height: 22,
            borderRadius: 999,
            background: '#fff',
            color: 'var(--purple)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          }}
        >
          <BookmarkIcon size={12} />
        </div>
      )}
    </button>
  );
}
