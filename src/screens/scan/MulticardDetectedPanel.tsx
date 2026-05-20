import type { PokemonCard } from '@/types/pokemon';
import { getEstimatedPrice, formatPriceShort } from '@/lib/pricing';
import TcgCardImage from '@/components/TcgCardImage';

interface MulticardDetectedPanelProps {
  detectedCards: PokemonCard[];
  onSave: () => void;
  onRetry: () => void;
}

export default function MulticardDetectedPanel({
  detectedCards,
  onSave,
  onRetry,
}: MulticardDetectedPanelProps) {
  const totalValue = detectedCards.reduce(
    (sum, card) => sum + (getEstimatedPrice(card)?.value ?? 0),
    0
  );

  return (
    <div
      style={{
        background: 'rgba(20,22,30,0.75)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 22,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        animation: 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#2F6FE0',
              boxShadow: '0 0 8px #2F6FE0',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>
            Escaneo simultáneo exitoso ({detectedCards.length} cartas)
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--success)',
            background: 'rgba(52, 199, 89, 0.12)',
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          Total:{' '}
          {formatPriceShort({
            value: totalValue,
            currency: 'USD',
            source: 'Total',
            provider: 'tcgplayer',
            tier: 'total',
          })}
        </div>
      </div>

      {/* List of cards */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {detectedCards.map((card, idx) => {
          const price = getEstimatedPrice(card);
          return (
            <div
              key={`${card.id}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '0.5px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                padding: 8,
                flexShrink: 0,
                minWidth: 150,
                animation: 'popIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <TcgCardImage card={card} width={42} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 90,
                  }}
                >
                  {card.name}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    color: 'rgba(255,255,255,0.5)',
                    marginTop: 1,
                  }}
                >
                  {card.set?.name ?? '—'} · {card.number}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: 'var(--success)',
                    marginTop: 2,
                  }}
                >
                  {formatPriceShort(price)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onRetry}
          style={{
            padding: '10px 16px',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: -0.1,
          }}
        >
          Reintentar
        </button>
        <button
          onClick={onSave}
          style={{
            flex: 1,
            padding: '10px',
            background: 'linear-gradient(135deg, #7B5AD9 0%, #2F6FE0 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: -0.1,
            boxShadow: '0 4px 16px rgba(47, 111, 224, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 200ms',
          }}
        >
          <span>📥 Guardar todas en mi Biblioteca</span>
        </button>
      </div>
    </div>
  );
}
