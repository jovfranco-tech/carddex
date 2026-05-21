import TcgCardImage from '@/components/TcgCardImage';
import type { RecognitionResult } from '@/lib/cardRecognition';

interface BatchSummaryPanelProps {
  /** All recognition results currently queued in the batch. */
  scannedBatch: RecognitionResult[];
  /** Called when the user taps "Limpiar lote". */
  onClearBatch: () => void;
  /** Called when the user taps the × button on a single card. */
  onRemoveCard: (cardId: string) => void;
  /** Called when the user taps "Guardar Lote en Biblioteca". */
  onSaveBatch: () => void;
}

/**
 * BatchSummaryPanel — shows the current batch of scanned cards with
 * a horizontal scroll strip, a clear button, and a save-all button.
 *
 * Extracted from ScanScreen.tsx for maintainability.
 */
export default function BatchSummaryPanel({
  scannedBatch,
  onClearBatch,
  onRemoveCard,
  onSaveBatch,
}: BatchSummaryPanelProps) {
  return (
    <div
      className="batch-tray-enter"
      style={{
        background: 'rgba(20,22,30,0.7)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 22,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        animation: 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header row: title + clear button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 2px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 8px var(--accent)',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>
            Lote actual ({scannedBatch.length})
          </span>
        </div>
        <button
          onClick={onClearBatch}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '2px 6px',
            borderRadius: 4,
            transition: 'color 150ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
        >
          Limpiar lote
        </button>
      </div>

      {/* Scrollable strip of card thumbnails */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {scannedBatch.map((item, idx) => {
          const card = item.card!;
          return (
            <div
              key={`${card.id}-${idx}`}
              style={{
                position: 'relative',
                flexShrink: 0,
                borderRadius: 8,
                overflow: 'visible',
                animation: 'popIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <TcgCardImage card={card} width={50} />
              <button
                onClick={() => onRemoveCard(card.id)}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#FF3B30',
                  border: '1.5px solid #14161e',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 9,
                  fontWeight: 900,
                }}
                title="Eliminar del lote"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Save batch button */}
      <button
        onClick={onSaveBatch}
        style={{
          width: '100%',
          padding: '11px',
          background: 'linear-gradient(135deg, var(--accent) 0%, #E07A25 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'inherit',
          cursor: 'pointer',
          letterSpacing: -0.1,
          boxShadow: '0 4px 16px rgba(242, 153, 74, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'all 200ms',
        }}
      >
        <span>📥 Guardar Lote en Biblioteca</span>
      </button>
    </div>
  );
}
