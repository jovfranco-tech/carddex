import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Surface from '@/components/Surface';
import { useDecks, useAsync, useCollection } from '@/lib/hooks';
import { getCardsByIds } from '@/lib/pokemonTcgApi';
import { removeCardFromDeck, updateDeckCards, removeCardFromDeckAll } from '@/lib/deckStorage';
import CardTile from '@/components/CardTile';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import {
  BackIcon,
  TrashIcon,
  LayersIcon,
  ShareIcon,
  DownloadIcon,
  GalleryIcon,
  BookIcon,
} from '@/components/icons';
import { Toast } from '@/components/Section';
import { ROUTES } from '@/app/routes';
import type { PokemonCard } from '@/types/pokemon';
import PremiumShareModal from '@/components/PremiumShareModal';
import SocialShareButton from '@/components/SocialShareButton';
import DeckPlaytestModal from '@/components/DeckPlaytestModal';
import DeckOptimizationModal from '@/components/DeckOptimizationModal';
import { triggerHaptic } from '@/lib/haptic';

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
        <button onClick={() => navigate(-1)} style={{ marginTop: 20 }}>
          Volver
        </button>
      </div>
    );
  }

  const collection = useCollection();

  const deckCardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (deck?.cards ?? []).forEach((id) => {
      counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }, [deck?.cards]);

  const deckCollectionMock = useMemo(() => {
    const cards: Record<string, any> = {};
    Object.keys(deckCardCounts).forEach((id) => {
      const actualCollectionMeta = collection.cards[id];
      cards[id] = {
        cardId: id,
        owned: true,
        quantity: deckCardCounts[id],
        favorite: actualCollectionMeta?.favorite || false,
        wishlist: actualCollectionMeta?.wishlist || false,
      };
    });
    return { cards };
  }, [deckCardCounts, collection.cards]);

  // Load actual card data using the TCG API
  const deckCards = useAsync(
    (signal) => getCardsByIds(deck?.cards ?? [], { signal }),
    [(deck?.cards ?? []).join(',')]
  );

  const [orderedCards, setOrderedCards] = useState<PokemonCard[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (deckCards.data) {
      setOrderedCards(deckCards.data);
    }
  }, [deckCards.data]);

  const saveNewOrder = (currentOrderedCards: PokemonCard[]) => {
    if (!deck) return;
    const newCardsList: string[] = [];
    currentOrderedCards.forEach((c) => {
      const count = deckCardCounts[c.id] || 0;
      for (let i = 0; i < count; i++) {
        newCardsList.push(c.id);
      }
    });
    updateDeckCards(deck.id, newCardsList);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const nextCards = [...orderedCards];
    const draggedCard = nextCards[draggedIndex];
    nextCards.splice(draggedIndex, 1);
    nextCards.splice(index, 0, draggedCard);

    setDraggedIndex(index);
    setOrderedCards(nextCards);
    triggerHaptic('light');
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setIsDraggingOverTrash(false);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    saveNewOrder(orderedCards);
    setDraggedIndex(null);
  };

  const handleDropOnTrash = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex !== null && deck) {
      const cardToRemove = orderedCards[draggedIndex];
      if (cardToRemove) {
        removeCardFromDeckAll(deck.id, cardToRemove.id);
        triggerHaptic('heavy');
        showToast(`Removido ${cardToRemove.name} del mazo`);
      }
    }
    handleDragEnd();
  };

  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    setDraggedIndex(index);
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggedIndex === null) return;
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    const trashEl = document.getElementById('deck-trash-zone');
    if (trashEl) {
      const rect = trashEl.getBoundingClientRect();
      const isOverTrash =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      setIsDraggingOverTrash(isOverTrash);
      if (isOverTrash) return;
    }

    const element = document.elementFromPoint(clientX, clientY);
    if (!element) return;

    const tileContainer = element.closest('[data-index]');
    if (tileContainer) {
      const hoverIndex = parseInt(tileContainer.getAttribute('data-index') || '', 10);
      if (!isNaN(hoverIndex) && hoverIndex !== draggedIndex) {
        const nextCards = [...orderedCards];
        const draggedCard = nextCards[draggedIndex];
        nextCards.splice(draggedIndex, 1);
        nextCards.splice(hoverIndex, 0, draggedCard);

        setDraggedIndex(hoverIndex);
        setOrderedCards(nextCards);
        triggerHaptic('light');
      }
    }
  };

  const handleTouchEnd = () => {
    if (draggedIndex === null) return;

    if (isDraggingOverTrash) {
      const cardToRemove = orderedCards[draggedIndex];
      if (cardToRemove && deck) {
        removeCardFromDeckAll(deck.id, cardToRemove.id);
        triggerHaptic('heavy');
        showToast(`Removido ${cardToRemove.name} del mazo`);
      }
    } else {
      saveNewOrder(orderedCards);
      triggerHaptic('light');
    }

    setDraggedIndex(null);
    setIsDraggingOverTrash(false);
  };

  const [toast, setToast] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPlaytestOpen, setIsPlaytestOpen] = useState(false);
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
  };

  const handleExport = () => {
    if (!deckCards.data || !deck || deck.cards.length === 0) return;
    try {
      const ptcglText = exportDeckToPTCGL(deckCards.data, deck.cards);
      navigator.clipboard
        .writeText(ptcglText)
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
      navigator.clipboard
        .writeText(shareUrl)
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
            onClick={() => {
              setIsOptimizerOpen(true);
              triggerHaptic('light');
            }}
            disabled={deckCards.loading || deck.cards.length === 0}
            title="Optimizar mazo con IA"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'var(--surface)',
              border: '0.5px solid var(--border)',
              color: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: deckCards.loading || deck.cards.length === 0 ? 'default' : 'pointer',
              opacity: deckCards.loading || deck.cards.length === 0 ? 0.4 : 1,
              transition: 'all 200ms',
            }}
          >
            <svg
              stroke="currentColor"
              fill="none"
              strokeWidth="2"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
              height="18"
              width="18"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5 5 3Z" />
              <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
            </svg>
          </button>
          <button
            onClick={() => setIsPlaytestOpen(true)}
            disabled={deckCards.loading || deck.cards.length === 0}
            title="Iniciar simulador Playtest"
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
            <BookIcon size={18} />
          </button>
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

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <SocialShareButton
            title={deck.name}
            subtitle={`Mazo Pokémon TCG · ${deck.cards.length} cartas`}
            imageUrl={orderedCards[0]?.images?.small || ''}
            qrValue={window.location.href}
            stats={[
              { label: 'Cartas', value: `${deck.cards.length}` },
              { label: 'Únicas', value: `${orderedCards.length}` },
              { label: 'Tipo', value: orderedCards[0]?.supertype || 'Mazo' },
            ]}
            onToast={showToast}
          />
        </div>

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
            {orderedCards.map((c, index) => {
              const ownedQty = collection.cards[c.id]?.quantity || 0;
              const deckQty = deckCardCounts[c.id] || 0;
              const isMissingOwned = deckQty > ownedQty;
              const isDragged = draggedIndex === index;

              return (
                <div
                  key={c.id}
                  data-index={index}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, index)}
                  onTouchStart={(e) => handleTouchStart(e, index)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  style={{
                    position: 'relative',
                    cursor: 'grab',
                    transition: 'transform 200ms ease, opacity 200ms ease',
                    opacity: isDragged ? 0.45 : 1,
                    transform: isDragged ? 'scale(1.08) rotate(2deg)' : 'scale(1)',
                    zIndex: isDragged ? 20 : 1,
                    touchAction: 'none',
                  }}
                >
                  <CardTile
                    card={c}
                    meta={deckCollectionMock.cards[c.id]}
                    width={104}
                    onClick={() => {
                      if (draggedIndex === null) {
                        navigate(`/card/${c.id}`);
                      }
                    }}
                  />

                  {isMissingOwned && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -4,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(239, 68, 68, 0.95)',
                        backdropFilter: 'blur(8px)',
                        color: '#fff',
                        fontSize: 8,
                        fontWeight: 900,
                        padding: '3px 6px',
                        borderRadius: 6,
                        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        border: '0.5px solid rgba(255, 255, 255, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      ⚠️ Falta x{deckQty - ownedQty}
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (deckQty > 1) {
                        removeCardFromDeck(deck.id, c.id);
                      } else if (window.confirm('¿Quitar del mazo?')) {
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
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      zIndex: 5,
                    }}
                    title={deckQty > 1 ? 'Reducir cantidad' : 'Quitar del mazo'}
                  >
                    {deckQty > 1 ? (
                      <span style={{ fontSize: 14, fontWeight: 800, marginTop: -2 }}>−</span>
                    ) : (
                      <TrashIcon size={10} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {draggedIndex !== null && (
        <div
          id="deck-trash-zone"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOverTrash(true);
          }}
          onDragLeave={() => setIsDraggingOverTrash(false)}
          onDrop={handleDropOnTrash}
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: 400,
            height: 70,
            borderRadius: 16,
            background: isDraggingOverTrash ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(20px)',
            border: isDraggingOverTrash
              ? '2px solid rgba(239, 68, 68, 0.8)'
              : '1.5px dashed rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: isDraggingOverTrash ? '#FF453A' : 'rgba(255, 255, 255, 0.8)',
            fontSize: 14,
            fontWeight: 800,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            zIndex: 100,
            transition: 'all 200ms ease',
          }}
        >
          <TrashIcon size={20} />
          <span>
            {isDraggingOverTrash
              ? '¡Suelta para quitar del mazo!'
              : 'Arrastra aquí para quitar del mazo'}
          </span>
        </div>
      )}

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

      <DeckPlaytestModal
        isOpen={isPlaytestOpen}
        onClose={() => setIsPlaytestOpen(false)}
        deckName={deck.name}
        deckCards={deckCards.data ?? []}
        cardIds={deck.cards}
      />

      {deck && deckCards.data && (
        <DeckOptimizationModal
          deck={deck}
          deckCards={deckCards.data}
          isOpen={isOptimizerOpen}
          onClose={() => setIsOptimizerOpen(false)}
        />
      )}
    </div>
  );
}
