import { useState, useEffect } from 'react';
import type { PokemonCard } from '@/types/pokemon';
import TcgCardImage from './TcgCardImage';
import Surface from './Surface';
import { CloseIcon } from './icons';
import { triggerHaptic } from '@/lib/haptic';

interface DeckPlaytestModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckName: string;
  deckCards: PokemonCard[];
  cardIds: string[];
}

export default function DeckPlaytestModal({
  isOpen,
  onClose,
  deckName,
  deckCards,
  cardIds,
}: DeckPlaytestModalProps) {
  const [deckPile, setDeckPile] = useState<PokemonCard[]>([]);
  const [hand, setHand] = useState<PokemonCard[]>([]);
  const [prizeCards, setPrizeCards] = useState<PokemonCard[]>([]);
  const [showPrizes, setShowPrizes] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);

  // Initialize and shuffle on open
  useEffect(() => {
    if (isOpen) {
      handleStartPlaytest();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const initializeDeck = () => {
    const fullDeck: PokemonCard[] = [];
    cardIds.forEach((id) => {
      const match = deckCards.find((c) => c.id === id);
      if (match) {
        fullDeck.push({ ...match });
      }
    });
    return fullDeck;
  };

  const shuffleDeck = (cards: PokemonCard[]) => {
    const list = [...cards];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  const handleStartPlaytest = () => {
    triggerHaptic('medium');
    const fullDeck = initializeDeck();
    const shuffled = shuffleDeck(fullDeck);
    
    const initialHand = shuffled.slice(0, 7);
    const initialPrizes = shuffled.slice(7, 13);
    const remainingDeck = shuffled.slice(13);

    setHand(initialHand);
    setPrizeCards(initialPrizes);
    setDeckPile(remainingDeck);
    setShowPrizes(false);
    setSelectedCard(null);
    setHistory(['Mazo inicializado y barajado. Mano inicial de 7 cartas robada.']);
  };

  const handleMulligan = () => {
    triggerHaptic('medium');
    const fullDeck = initializeDeck();
    const shuffled = shuffleDeck(fullDeck);
    
    const initialHand = shuffled.slice(0, 7);
    const initialPrizes = shuffled.slice(7, 13);
    const remainingDeck = shuffled.slice(13);

    setHand(initialHand);
    setPrizeCards(initialPrizes);
    setDeckPile(remainingDeck);
    setShowPrizes(false);
    setSelectedCard(null);
    setHistory((prev) => [...prev, '¡Mulligan! Se rebarajó el mazo y se robó una mano de 7 cartas.']);
  };

  const handleDrawCard = () => {
    if (deckPile.length === 0) return;
    triggerHaptic('light');
    const nextDeck = [...deckPile];
    const drawn = nextDeck.shift()!;
    setHand((prev) => [...prev, drawn]);
    setDeckPile(nextDeck);
    setHistory((prev) => [...prev, `Robada: ${drawn.name}`]);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(10, 11, 16, 0.92)',
        backdropFilter: 'blur(30px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        color: '#fff',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 18px',
          borderBottom: '0.5px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Simulador Playtest</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>{deckName}</div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Main Interactive Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: 16,
          gap: 16,
        }}
      >
        {/* Row 1: Deck and Prize piles */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Deck remaining */}
          <Surface
            style={{
              flex: 1,
              padding: 16,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '0.5px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              minHeight: 120,
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>
              {deckPile.length}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 700, marginTop: 4 }}>
              Cartas en mazo
            </div>
            <button
              onClick={handleDrawCard}
              disabled={deckPile.length === 0}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                borderRadius: 10,
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                cursor: deckPile.length === 0 ? 'default' : 'pointer',
                opacity: deckPile.length === 0 ? 0.4 : 1,
                boxShadow: '0 4px 12px rgba(47, 111, 224, 0.3)',
              }}
            >
              Robar Carta
            </button>
          </Surface>

          {/* Prize cards */}
          <Surface
            style={{
              flex: 1,
              padding: 16,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '0.5px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              minHeight: 120,
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 900, color: '#F2994A' }}>
              {prizeCards.length}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 700, marginTop: 4 }}>
              Premios (Boca Abajo)
            </div>
            <button
              onClick={() => setShowPrizes(!showPrizes)}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {showPrizes ? 'Ocultar Premios' : 'Ver Premios'}
            </button>
          </Surface>
        </div>

        {/* Prize cards reveal panel */}
        {showPrizes && (
          <Surface
            style={{
              padding: 14,
              background: 'rgba(242, 153, 74, 0.1)',
              border: '1px dashed rgba(242, 153, 74, 0.3)',
              borderRadius: 16,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#F2994A', marginBottom: 10 }}>
              Premios Actuales:
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 4,
              }}
            >
              {prizeCards.map((c, i) => (
                <div key={`${c.id}-${i}`} onClick={() => setSelectedCard(c)} style={{ cursor: 'pointer' }}>
                  <TcgCardImage card={c} width={75} />
                </div>
              ))}
            </div>
          </Surface>
        )}

        {/* Hand Area */}
        <Surface
          style={{
            padding: 16,
            background: 'rgba(255, 255, 255, 0.02)',
            border: '0.5px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 20,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
              Mano del Jugador ({hand.length} cartas)
            </div>
            {hand.length === 7 && (
              <button
                onClick={handleMulligan}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,59,48,0.15)',
                  border: '0.5px solid rgba(255,59,48,0.3)',
                  color: '#FF3B30',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Mulligan
              </button>
            )}
          </div>

          {hand.length === 0 ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              No tienes cartas en la mano.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: 10,
                overflowX: 'auto',
                paddingBottom: 8,
              }}
            >
              {hand.map((c, i) => (
                <div
                  key={`${c.id}-${i}`}
                  onClick={() => setSelectedCard(c)}
                  style={{
                    cursor: 'pointer',
                    transition: 'transform 200ms ease',
                    transform: selectedCard?.id === c.id ? 'scale(1.05) translateY(-4px)' : 'scale(1)',
                  }}
                >
                  <TcgCardImage card={c} width={80} />
                </div>
              ))}
            </div>
          )}
        </Surface>

        {/* Selected Card preview and action details */}
        {selectedCard && (
          <Surface
            style={{
              padding: 16,
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <TcgCardImage card={selectedCard} width={75} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{selectedCard.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {selectedCard.supertype} - {selectedCard.subtypes?.join(', ')}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => {
                    // Action: Move card from Hand to Pile or Premios
                    const idx = hand.findIndex((x) => x.id === selectedCard.id);
                    if (idx !== -1) {
                      const nextHand = [...hand];
                      nextHand.splice(idx, 1);
                      setHand(nextHand);
                      setHistory((prev) => [...prev, `Jugada/Descartada: ${selectedCard.name}`]);
                      setSelectedCard(null);
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--success)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Jugar/Descartar
                </button>
                <button
                  onClick={() => setSelectedCard(null)}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cerrar Vista
                </button>
              </div>
            </div>
          </Surface>
        )}

        {/* History / Log */}
        <Surface
          style={{
            padding: 14,
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 16,
            flex: 1,
            minHeight: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            Registro de Juego:
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'rgba(255, 255, 255, 0.7)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {history.map((h, i) => (
              <div key={i}>&gt; {h}</div>
            ))}
          </div>
        </Surface>
      </div>

      {/* Footer controls */}
      <div
        style={{
          padding: 16,
          borderTop: '0.5px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          gap: 12,
        }}
      >
        <button
          onClick={handleStartPlaytest}
          style={{
            flex: 1,
            padding: 14,
            borderRadius: 12,
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reiniciar
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: 14,
            borderRadius: 12,
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Terminar Test
        </button>
      </div>
    </div>
  );
}
