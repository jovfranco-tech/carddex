import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Surface from '@/components/Surface';
import { useDecks, useAsync, useCollection } from '@/lib/hooks';
import { getCardsByIds } from '@/lib/pokemonTcgApi';
import { removeCardFromDeck } from '@/lib/deckStorage';
import CardTile from '@/components/CardTile';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { BackIcon, TrashIcon, LayersIcon, ShareIcon, DownloadIcon, GalleryIcon } from '@/components/icons';
import { Toast } from '@/components/Section';
import { ROUTES } from '@/app/routes';
import type { PokemonCard } from '@/types/pokemon';
import PremiumShareModal from '@/components/PremiumShareModal';

/**
 * Maps a list of cards to official Pokémon TCG Live (PTCGL) export format.
 * Format: [Qty] [Name] [SetCode] [Number]
 */
function exportDeckToPTCGL(deckCards: PokemonCard[], deckCardIds: string[]): string {
  const counts: Record<string, number> = {};
  for (const id of deckCardIds) {
    counts[id] = (counts[id] || 0) + 1;
  }

  const uniqueCards = deckCards.filter(
    (card, index, self) => self.findIndex((c) => c.id === card.id) === index
  );

  const pokemonList: string[] = [];
  const trainerList: string[] = [];
  const energyList: string[] = [];

  let pokemonQty = 0;
  let trainerQty = 0;
  let energyQty = 0;

  for (const card of uniqueCards) {
    const qty = counts[card.id] || 0;
    const name = card.name;
    const setCode = (card.set.ptcgoCode || card.set.id).toUpperCase();
    const number = card.number;
    const line = `${qty} ${name} ${setCode} ${number}`;

    const supertype = card.supertype?.toLowerCase() || '';
    if (supertype.includes('pokemon') || supertype.includes('pokémon')) {
      pokemonList.push(line);
      pokemonQty += qty;
    } else if (supertype.includes('trainer')) {
      trainerList.push(line);
      trainerQty += qty;
    } else if (supertype.includes('energy')) {
      energyList.push(line);
      energyQty += qty;
    } else {
      pokemonList.push(line);
      pokemonQty += qty;
    }
  }

  const sections: string[] = [];
  if (pokemonList.length > 0) {
    sections.push(`Pokémon: ${pokemonQty}\n${pokemonList.join('\n')}`);
  }
  if (trainerList.length > 0) {
    sections.push(`Trainer: ${trainerQty}\n${trainerList.join('\n')}`);
  }
  if (energyList.length > 0) {
    sections.push(`Energy: ${energyQty}\n${energyList.join('\n')}`);
  }

  return sections.join('\n\n');
}

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

  const [toast, setToast] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
  };

  const handleExport = () => {
    if (!deckCards.data || !deck || deck.cards.length === 0) return;
    try {
      const ptcglText = exportDeckToPTCGL(deckCards.data, deck.cards);
      navigator.clipboard.writeText(ptcglText)
        .then(() => {
          showToast('Lista de mazo copiada en formato PTCGL');
        })
        .catch((err) => {
          console.error('Failed to copy deck list:', err);
          showToast('Error al copiar la lista del mazo');
        });
    } catch (err) {
      console.error('Failed to export deck:', err);
      showToast('Error al exportar el mazo');
    }
  };

  const handleShare = () => {
    if (!deck) return;
    try {
      const shareUrl = `${window.location.origin}${ROUTES.deckShare(deck.id)}?name=${encodeURIComponent(deck.name)}&cards=${deck.cards.join(',')}`;
      navigator.clipboard.writeText(shareUrl)
        .then(() => {
          showToast('¡Enlace de mazo público copiado!');
        })
        .catch((err) => {
          console.error('Failed to copy share link:', err);
          showToast('Error al copiar el enlace');
        });
    } catch (err) {
      console.error('Failed to generate share link:', err);
      showToast('Error al generar el enlace');
    }
  };

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
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setIsShareModalOpen(true)}
            disabled={deckCards.loading || deck.cards.length === 0}
            title="Compartir Tarjeta Mazo"
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
              cursor: deckCards.loading || deck.cards.length === 0 ? 'default' : 'pointer',
              opacity: deckCards.loading || deck.cards.length === 0 ? 0.4 : 1,
              transition: 'all 200ms',
            }}
          >
            <GalleryIcon size={18} />
          </button>
          <button
            onClick={handleShare}
            disabled={deck.cards.length === 0}
            title="Copiar enlace de compartir"
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
              cursor: deck.cards.length === 0 ? 'default' : 'pointer',
              opacity: deck.cards.length === 0 ? 0.4 : 1,
              transition: 'all 200ms',
            }}
          >
            <ShareIcon size={18} />
          </button>
          <button
            onClick={handleExport}
            disabled={deckCards.loading || deck.cards.length === 0}
            title="Exportar mazo a PTCGL"
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
              cursor: deckCards.loading || deck.cards.length === 0 ? 'default' : 'pointer',
              opacity: deckCards.loading || deck.cards.length === 0 ? 0.4 : 1,
              transition: 'all 200ms',
            }}
          >
            <DownloadIcon size={18} />
          </button>
        </div>
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

      {/* Toast feedback */}
      <Toast
        message={toast ?? ''}
        visible={!!toast}
        onHide={() => setToast(null)}
        duration={2000}
      />

      <PremiumShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        deckName={deck.name}
        deckCards={deckCards.data ?? []}
        cardIds={deck.cards}
        onShowToast={showToast}
      />
    </div>
  );
}
