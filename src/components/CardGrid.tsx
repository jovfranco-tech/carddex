import type { PokemonCard } from '@/types/pokemon';
import CardTile from './CardTile';
import { useCollection } from '@/lib/hooks';

export interface CardGridProps {
  cards: PokemonCard[];
  onCardClick: (id: string) => void;
  /** If true, show dashed "Falta" treatment for cards not in collection. */
  showMissingState?: boolean;
  columns?: number;
  tileWidth?: number;
  emptyState?: React.ReactNode;
}

export default function CardGrid({
  cards,
  onCardClick,
  showMissingState = false,
  columns = 3,
  tileWidth,
  emptyState,
}: CardGridProps) {
  const collection = useCollection();

  if (cards.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      style={{
        padding: '0 18px',
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 12,
        justifyItems: 'center',
      }}
    >
      {cards.map((card) => {
        const meta = collection.cards[card.id];
        return (
          <CardTile
            key={card.id}
            card={card}
            meta={meta}
            width={tileWidth}
            onClick={() => onCardClick(card.id)}
            showMissingState={showMissingState}
          />
        );
      })}
    </div>
  );
}
