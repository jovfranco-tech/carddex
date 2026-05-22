import TcgCardImage from '@/components/TcgCardImage';
import RarityBadge from '@/components/RarityBadge';
import { getEstimatedPrice, formatPriceShort } from '@/lib/pricing';
import type { RecognitionResult } from '@/lib/cardRecognition';

interface DetectedPanelProps {
  result: RecognitionResult;
  confidence: number;
  onView: () => void;
  onWrong: () => void;
}

export default function DetectedPanel({
  result,
  confidence,
  onView,
  onWrong,
}: DetectedPanelProps) {
  const card = result.card!;
  const isVectorMatch = result.source === 'vector_match';
  const isOffline = result.source === 'offline_fallback';
  const matchColor = isVectorMatch ? '#00E5FF' : isOffline ? '#FF9500' : 'var(--success)';
  const price = getEstimatedPrice(card);
  const categoryColor =
    result.cardCategory === 'Pokémon'
      ? '#34C759'
      : result.cardCategory === 'Trainer'
        ? '#F2994A'
        : result.cardCategory === 'Energy'
          ? '#7B5AD9'
          : '#8E8E93';

  return (
    <div
      style={{
        background: 'rgba(20,22,30,0.7)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: isVectorMatch ? '1px solid rgba(0, 229, 255, 0.4)' : '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 22,
        padding: 14,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        boxShadow: isVectorMatch ? '0 0 16px rgba(0, 229, 255, 0.25), inset 0 1px 0 rgba(255,255,255,0.1)' : undefined,
        animation: isVectorMatch ? 'vectorMatchPulse 2s infinite ease-in-out' : undefined,
      }}
    >
      <TcgCardImage card={card} width={78} />
      <div style={{ flex: 1, paddingTop: 2, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: matchColor,
                boxShadow: `0 0 8px ${matchColor}`,
              }}
            />
            <span
              style={{
                fontSize: 10.5,
                color: matchColor,
                fontWeight: 800,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
              }}
            >
              {isVectorMatch ? `✦ RECONOCIMIENTO IA: ${(confidence * 100).toFixed(1)}%` : isOffline ? 'Modo Offline' : `Coincidencia ${confidence}%`}
            </span>
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 999,
              color: categoryColor,
              background: categoryColor + '24',
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            {result.cardCategory}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: -0.3,
              maxWidth: 140,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {card.name}
          </span>
          <RarityBadge rarity={card.rarity} />
        </div>

        {/* Pokémon types row */}
        {result.cardCategory === 'Pokémon' && result.pokemonTypes && result.pokemonTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {result.pokemonTypes.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.85)',
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginTop: 6,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 500,
              }}
            >
              Valor estimado
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: 'var(--success)',
                letterSpacing: -0.3,
              }}
            >
              {formatPriceShort(price)}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 500,
              }}
            >
              {result.number ? `Nº ${result.number}` : 'Expansión'}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                maxWidth: 130,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {result.possibleSetName ?? card.set?.name ?? '—'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={onWrong}
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: '0.5px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: -0.1,
            }}
          >
            No es esta
          </button>
          <button
            onClick={onView}
            style={{
              flex: 1,
              padding: '8px',
              background: '#fff',
              color: 'var(--scanner-bg)',
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: -0.1,
            }}
          >
            Ver detalle
          </button>
        </div>
        {result.simulated && (
          <div
            style={{
              marginTop: 8,
              fontSize: 10,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: 0.1,
            }}
          >
            Resultado simulado · escáner real en próxima versión
          </div>
        )}
        {result.source === 'offline_fallback' && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(255, 149, 0, 0.12)',
              border: '0.5px solid rgba(255, 149, 0, 0.3)',
              fontSize: 10.5,
              fontWeight: 600,
              color: '#FF9500',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              letterSpacing: 0.1,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#FF9500',
                boxShadow: '0 0 6px #FF9500',
                display: 'inline-block',
              }}
            />
            Modo Offline · Coincidencia local aproximada
          </div>
        )}
        {isVectorMatch && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(0, 229, 255, 0.08)',
              border: '0.5px solid rgba(0, 229, 255, 0.25)',
              fontSize: 10.5,
              fontWeight: 600,
              color: '#00E5FF',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              letterSpacing: 0.1,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#00E5FF',
                boxShadow: '0 0 6px #00E5FF',
                display: 'inline-block',
              }}
            />
            Búsqueda Vectorial Multimodal (Embedding 1536d)
          </div>
        )}
      </div>
      <style>{`
        @keyframes vectorMatchPulse {
          0% { box-shadow: 0 0 12px rgba(0, 229, 255, 0.15); border-color: rgba(0, 229, 255, 0.3); }
          50% { box-shadow: 0 0 20px rgba(0, 229, 255, 0.35); border-color: rgba(0, 229, 255, 0.6); }
          100% { box-shadow: 0 0 12px rgba(0, 229, 255, 0.15); border-color: rgba(0, 229, 255, 0.3); }
        }
      `}</style>
    </div>
  );
}
