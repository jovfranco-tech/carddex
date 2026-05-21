import { triggerHaptic } from '@/lib/haptic';
import type { PokemonCard } from '@/types/pokemon';

interface MoreActionsModalProps {
  card: PokemonCard;
  onClose: () => void;
  onDownloadImage: () => void;
  onCopyId: () => void;
  onCreateDeck: () => void;
}

/**
 * MoreActionsModal — the "⋯" bottom-sheet drawer shown on the card detail page.
 * Extracted from DetailScreen.tsx for maintainability.
 */
export default function MoreActionsModal({
  card,
  onClose,
  onDownloadImage,
  onCopyId,
  onCreateDeck,
}: MoreActionsModalProps) {
  const actionBtnStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px',
    background: 'rgba(0, 0, 0, 0.03)',
    border: 'none',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--ink)',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontFamily: 'inherit',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 20, 40, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Acciones de carta"
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: '20px 20px 34px',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.15)',
          borderTop: '0.5px solid rgba(255, 255, 255, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          animation: 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 36,
            height: 5,
            background: 'rgba(0, 0, 0, 0.15)',
            borderRadius: 3,
            alignSelf: 'center',
            marginBottom: 12,
          }}
        />

        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--muted)',
            marginBottom: 6,
            paddingLeft: 8,
          }}
        >
          Acciones de Carta
        </div>

        <button
          onClick={() => {
            onClose();
            onDownloadImage();
          }}
          style={actionBtnStyle}
        >
          📥 Descargar Imagen
        </button>

        <button
          onClick={() => {
            onClose();
            onCopyId();
          }}
          style={actionBtnStyle}
        >
          📋 Copiar ID de Carta
        </button>

        {card.tcgplayer?.url && (
          <button
            onClick={() => {
              onClose();
              window.open(card.tcgplayer?.url, '_blank');
            }}
            style={actionBtnStyle}
          >
            🌐 Ver en TCGPlayer
          </button>
        )}

        <button
          onClick={() => {
            onClose();
            onCreateDeck();
          }}
          style={{
            ...actionBtnStyle,
            background: 'rgba(123, 90, 217, 0.1)',
            color: 'var(--accent)',
          }}
        >
          ➕ Crear mazo con esta carta
        </button>

        <button
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          style={{
            ...actionBtnStyle,
            background: 'rgba(0, 0, 0, 0.05)',
            fontWeight: 700,
            color: 'var(--ink-2)',
            textAlign: 'center',
            justifyContent: 'center',
            marginTop: 8,
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
