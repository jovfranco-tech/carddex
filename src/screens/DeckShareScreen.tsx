import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Surface from '@/components/Surface';
import { useAsync } from '@/lib/hooks';
import { getCardsByIds } from '@/lib/pokemonTcgApi';
import CardTile from '@/components/CardTile';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { BackIcon, LayersIcon, DownloadIcon, GalleryIcon } from '@/components/icons';
import { Toast } from '@/components/Section';
import React from 'react';
const VisualCollectionStats = React.lazy(() => import('@/components/VisualCollectionStats'));
import type { PokemonCard } from '@/types/pokemon';
import { ROUTES } from '@/app/routes';
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

export default function DeckShareScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const name = searchParams.get('name') ?? 'Mazo Público';
  const cardsQuery = searchParams.get('cards') ?? '';

  const cardIds = useMemo(() => {
    return cardsQuery ? cardsQuery.split(',').filter(Boolean) : [];
  }, [cardsQuery]);

  // Load actual card data using the TCG API/Cache
  const deckCards = useAsync(
    (signal) => (cardIds.length ? getCardsByIds(cardIds, { signal }) : Promise.resolve([])),
    [cardIds.join(',')]
  );

  const [toast, setToast] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
  };

  const handleExport = () => {
    if (!deckCards.data || cardIds.length === 0) return;
    try {
      const ptcglText = exportDeckToPTCGL(deckCards.data, cardIds);
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

  const cardCountsMap = useMemo(() => {
    const counts: Record<string, { quantity: number; owned: boolean }> = {};
    for (const id of cardIds) {
      counts[id] = { quantity: (counts[id]?.quantity ?? 0) + 1, owned: true };
    }
    return counts;
  }, [cardIds]);

  const collectionMock = useMemo(() => {
    return { cards: cardCountsMap } as any;
  }, [cardCountsMap]);

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(ROUTES.home);
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
          borderBottom: '0.5px solid var(--border)',
        }}
      >
        <button
          onClick={handleBack}
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
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: -0.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            padding: '0 8px',
          }}
        >
          {name}
        </div>
        <button
          onClick={() => setIsShareModalOpen(true)}
          disabled={deckCards.loading || cardIds.length === 0}
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
            cursor: deckCards.loading || cardIds.length === 0 ? 'default' : 'pointer',
            opacity: deckCards.loading || cardIds.length === 0 ? 0.4 : 1,
            transition: 'all 200ms',
            marginRight: 6,
          }}
        >
          <GalleryIcon size={18} />
        </button>
        <button
          onClick={handleExport}
          disabled={deckCards.loading || cardIds.length === 0}
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
            cursor: deckCards.loading || cardIds.length === 0 ? 'default' : 'pointer',
            opacity: deckCards.loading || cardIds.length === 0 ? 0.4 : 1,
            transition: 'all 200ms',
          }}
        >
          <DownloadIcon size={18} />
        </button>
      </div>

      <div style={{ padding: '14px 0 0' }}>
        {/* Banner */}
        <div style={{ padding: '0 14px 14px' }}>
          <Surface style={{ padding: 16, textAlign: 'center', background: 'linear-gradient(135deg, var(--surface), rgba(240, 243, 250, 0.5))', border: '1px dashed var(--accent-tint)' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--ink)', letterSpacing: -0.5 }}>
              {cardIds.length} / 60
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, fontWeight: 700 }}>
              Cartas en este Mazo Compartido
            </div>
          </Surface>
        </div>

        {/* Visual Analytics */}
        {deckCards.data && deckCards.data.length > 0 && (
          <React.Suspense fallback={<div style={{ minHeight: 80, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>Cargando análisis visual...</div>}>
            <VisualCollectionStats
              ownedCards={deckCards.data}
              collection={collectionMock}
              title="Análisis del Mazo"
              isDeck={true}
            />
          </React.Suspense>
        )}

        {/* Card Grid */}
        <div style={{ padding: '0 14px 14px' }}>
          {deckCards.loading ? (
            <LoadingState variant="grid" count={6} />
          ) : cardIds.length === 0 ? (
            <EmptyState
              icon={<LayersIcon size={42} />}
              title="Este mazo no tiene cartas"
              description="El enlace compartido parece no incluir identificadores de cartas válidos."
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                justifyItems: 'center',
                marginTop: 8,
              }}
            >
              {(deckCards.data ?? []).map((c) => (
                <div key={c.id} style={{ position: 'relative' }}>
                  <CardTile
                    card={c}
                    meta={collectionMock.cards[c.id]}
                    width={104}
                    onClick={() => navigate(`/card/${c.id}`)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
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
        deckName={name}
        deckCards={deckCards.data ?? []}
        cardIds={cardIds}
        onShowToast={showToast}
      />
    </div>
  );
}
