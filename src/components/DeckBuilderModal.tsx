import { useState } from 'react';
import { createDeck, updateDeckCards } from '@/lib/deckStorage';
import { searchCards } from '@/lib/pokemonTcgApi';
import { triggerHaptic } from '@/lib/haptic';

interface DeckBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (deckId: string) => void;
  onShowToast: (msg: string) => void;
}

export default function DeckBuilderModal({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
}: DeckBuilderModalProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    triggerHaptic('medium');
    setStatusText('Consultando al Copiloto de IA...');

    try {
      // 1. Fetch AI deck archetype definition
      const res = await fetch('/api/deck-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!res.ok) {
        throw new Error('Error al conectar con la IA de construcción de mazos.');
      }

      const deckSpec = await res.json();
      setStatusText('IA ha propuesto un arquetipo. Resolviendo cartas oficiales...');

      // 2. Resolve card names to official TCG database IDs
      const resolvedCardIds: string[] = [];
      
      for (const card of deckSpec.cards) {
        setStatusText(`Buscando: ${card.name} (x${card.quantity})...`);
        try {
          const searchRes = await searchCards({ name: `"${card.name}"`, pageSize: 1 });
          if (searchRes.data && searchRes.data.length > 0) {
            const foundCard = searchRes.data[0];
            for (let i = 0; i < card.quantity; i++) {
              resolvedCardIds.push(foundCard.id);
            }
          } else {
            // Fallback search with loose matching if exact search yielded nothing
            const looseRes = await searchCards({ name: card.name, pageSize: 1 });
            if (looseRes.data && looseRes.data.length > 0) {
              const foundCard = looseRes.data[0];
              for (let i = 0; i < card.quantity; i++) {
                resolvedCardIds.push(foundCard.id);
              }
            } else {
              console.warn(`Card name could not be resolved: ${card.name}`);
            }
          }
        } catch (err) {
          console.error(`Error resolving card: ${card.name}`, err);
        }
      }

      if (resolvedCardIds.length === 0) {
        throw new Error('No se pudo encontrar ninguna de las cartas propuestas por la IA.');
      }

      setStatusText('Guardando el mazo de 60 cartas en tu colección local...');
      
      // 3. Create the deck and fill it
      const newDeckName = deckSpec.name || 'Mazo IA Personalizado';
      const created = createDeck(newDeckName);
      updateDeckCards(created.id, resolvedCardIds);

      triggerHaptic('success');
      onShowToast(`Mazo "${newDeckName}" creado con ${resolvedCardIds.length} cartas.`);
      onSuccess(created.id);
      onClose();
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Error construyendo el mazo.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface)',
          borderRadius: 24,
          padding: 24,
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          border: '0.5px solid var(--border)',
          animation: 'scaleInDeckBuilder 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.4 }}>
            AI Deck Builder Copilot
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 20,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '30px 10px', textAlign: 'center' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '3px solid var(--border)',
                borderTopColor: 'var(--accent)',
                animation: 'spinDeckBuilder 1s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
              {statusText}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Esto puede tardar unos segundos mientras resolvemos imágenes y cartas oficiales de la API.
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerate}>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
              Escribe qué tipo de mazo te gustaría armar. La IA diseñará la lista de 60 cartas perfecta con sinergias avanzadas.
            </p>
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej: Mazo competitivo de Charizard ex con aceleración de energías fuego y soporte de dibujo de Pidgeot ex."
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'none',
                boxSizing: 'border-box',
                outline: 'none',
                marginBottom: 20,
              }}
            />
            <button
              type="submit"
              style={{
                width: '100%',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                padding: 14,
                borderRadius: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(123, 90, 217, 0.25)',
              }}
            >
              ✦ Generar Mazo con IA
            </button>
          </form>
        )}
      </div>

      <style>{`
        @keyframes scaleInDeckBuilder {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes spinDeckBuilder {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
