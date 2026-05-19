import { useNavigate, useParams } from 'react-router-dom';
import Surface from '@/components/Surface';
import { useDecks, useAsync, useCollection } from '@/lib/hooks';
import { getCardsByIds } from '@/lib/pokemonTcgApi';
import { removeCardFromDeck } from '@/lib/deckStorage';
import CardTile from '@/components/CardTile';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { BackIcon, TrashIcon, LayersIcon } from '@/components/icons';

export default function DeckDetailScreen() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const decksState = useDecks();
  const deck = deckId ? decksState.decks[deckId] : undefined;

  if (!deck) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div>Mazo no encontrado</div>
        <button onClick={() => navigate(-1)} style={{ marginTop: 20 }}>Volver</button>
      </div>
    );
  }

  const collection = useCollection();

  // Load actual card data using the TCG API
  const deckCards = useAsync(
    (signal) => getCardsByIds(deck?.cards ?? [], { signal }),
    [(deck?.cards ?? []).join(',')]
  );

  return (
    <div style={{ paddingBottom: 110 }}>
      {/* Top bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          padding: '54px 14px 10px',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: 'var(--surface)',
            border: '0.5px solid var(--border)',
            color: 'var(--ink-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <BackIcon size={18} />
        </button>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--ink)',
            letterSpacing: -0.3,
          }}
        >
          {deck.name}
        </div>
        <div style={{ width: 38 }} />
      </div>

      <div style={{ padding: '0 14px 14px' }}>
        <Surface style={{ padding: 16, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>
            {deck.cards.length} / 60
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>
            Cartas en el mazo
          </div>
        </Surface>

        {deckCards.loading ? (
          <LoadingState variant="grid" count={6} />
        ) : deck.cards.length === 0 ? (
          <EmptyState
            icon={<LayersIcon size={42} />}
            title="Mazo vacío"
            description="Ve al detalle de cualquier carta para agregarla a este mazo."
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              justifyItems: 'center',
            }}
          >
            {(deckCards.data ?? []).map((c) => (
              <div key={c.id} style={{ position: 'relative' }}>
                <CardTile
                  card={c}
                  meta={collection.cards[c.id]}
                  width={104}
                  onClick={() => navigate(`/card/${c.id}`)}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('¿Quitar del mazo?')) {
                      removeCardFromDeck(deck.id, c.id);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: 'var(--error)',
                    color: '#fff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
