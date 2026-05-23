import { useEffect, useState } from 'react';
import Surface from './Surface';
import { triggerHaptic } from '@/lib/haptic';

const MIN_CARDS_FOR_SYNERGIES = 5;
const SERVER_SYNERGY_ENABLED =
  import.meta.env.VITE_SYNERGY_FEED_MODE === 'server' || import.meta.env.MODE === 'test';

interface SynergyItem {
  title: string;
  cardsInvolved: string;
  tag: string;
  explanation: string;
  recommendation: string;
}

interface AISynergyFeedProps {
  ownedCardNames: string[];
}

export default function AISynergyFeed({ ownedCardNames }: AISynergyFeedProps) {
  const [synergies, setSynergies] = useState<SynergyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEnoughCards = ownedCardNames.length >= MIN_CARDS_FOR_SYNERGIES;

  const buildLocalSynergies = (): SynergyItem[] => [
    {
      title: 'Vista rápida de colección',
      cardsInvolved: ownedCardNames.slice(0, 4).join(', '),
      tag: 'Demo local',
      explanation:
        'CardDex detecta suficientes cartas para mostrar recomendaciones, pero el feed LLM de servidor no está activado.',
      recommendation:
        'Usa estas sugerencias como checklist ligero y configura VITE_SYNERGY_FEED_MODE=server si quieres análisis LLM real vía backend.',
    },
  ];

  const fetchSynergies = async (force = false) => {
    if (!hasEnoughCards) return;
    if (!SERVER_SYNERGY_ENABLED) {
      setSynergies(buildLocalSynergies());
      setError(null);
      if (force) triggerHaptic('light');
      return;
    }
    setLoading(true);
    setError(null);
    if (force) {
      triggerHaptic('medium');
    }

    try {
      const response = await fetch('/api/synergy-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: ownedCardNames }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          setError('Demasiadas solicitudes. Espera un momento.');
          return;
        }
        throw new Error('Error al obtener sinergias');
      }

      const data = await response.json();
      if (data.synergies) {
        setSynergies(data.synergies);
        localStorage.setItem(
          'carddex.cachedSynergies',
          JSON.stringify({
            data: data.synergies,
            timestamp: Date.now(),
            cardCount: ownedCardNames.length,
          })
        );
        if (force) {
          triggerHaptic('success');
        }
      } else {
        throw new Error('Formato inválido de sinergias');
      }
    } catch {
      setError('No se pudieron obtener sinergias con IA.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasEnoughCards) return;

    if (!SERVER_SYNERGY_ENABLED) {
      setSynergies(buildLocalSynergies());
      return;
    }

    // Check cache
    try {
      const cached = localStorage.getItem('carddex.cachedSynergies');
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // Cache valid for 3 hours
        if (Date.now() - timestamp < 3 * 60 * 60 * 1000) {
          setSynergies(data);
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }

    fetchSynergies();
  }, [ownedCardNames.join(',')]);

  const getTagColor = (tag: string) => {
    const t = tag.toLowerCase();
    if (t.includes('consistencia') || t.includes('vel')) return '#2D9CDB';
    if (t.includes('ataque') || t.includes('daño')) return '#EB5757';
    if (t.includes('control')) return '#F2C94C';
    if (t.includes('energía')) return '#9B51E0';
    return 'var(--muted)';
  };

  // Not enough cards — show motivational prompt
  if (!hasEnoughCards) {
    const needed = MIN_CARDS_FOR_SYNERGIES - ownedCardNames.length;
    return (
      <div style={{ padding: '0 18px 24px' }}>
        <h3
          style={{
            margin: '0 0 12px',
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: -0.4,
          }}
        >
          Sinergias sugeridas
        </h3>
        <Surface style={{ padding: 20, border: '0.5px dashed var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔮</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>
            ¡Casi listo para el análisis!
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            Agrega{' '}
            <strong style={{ color: 'var(--accent)' }}>
              {needed} carta{needed !== 1 ? 's' : ''} más
            </strong>{' '}
            a tu colección para desbloquear sugerencias de sinergia y estrategia de mazo.
          </p>
          <div
            style={{
              marginTop: 12,
              height: 5,
              background: 'var(--border)',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(ownedCardNames.length / MIN_CARDS_FOR_SYNERGIES) * 100}%`,
                background: 'linear-gradient(90deg, var(--accent), #2F6FE0)',
                borderRadius: 99,
                transition: 'width 500ms ease',
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
            {ownedCardNames.length} / {MIN_CARDS_FOR_SYNERGIES} cartas
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 18px 24px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: -0.4,
          }}
        >
          Sinergias sugeridas
        </h3>
        <button
          onClick={() => fetchSynergies(true)}
          disabled={loading}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          {loading ? 'Analizando...' : 'Refrescar'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 2 }).map((_, idx) => (
            <Surface
              key={idx}
              style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <div
                style={{
                  height: 16,
                  width: '40%',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 4,
                  animation: 'synergyShimmer 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  height: 12,
                  width: '90%',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 4,
                  animation: 'synergyShimmer 1.5s ease-in-out infinite 0.2s',
                }}
              />
              <div
                style={{
                  height: 12,
                  width: '70%',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 4,
                  animation: 'synergyShimmer 1.5s ease-in-out infinite 0.4s',
                }}
              />
            </Surface>
          ))}
        </div>
      ) : error ? (
        <div
          style={{ color: 'var(--error)', fontSize: 12.5, textAlign: 'center', padding: '16px 0' }}
        >
          ⚠️ {error}
        </div>
      ) : synergies.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {synergies.map((synergy, idx) => (
            <Surface
              key={idx}
              style={{
                padding: 16,
                border: '0.5px solid var(--border)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Highlight bar */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: 3.5,
                  background: getTagColor(synergy.tag),
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 800,
                    color: 'var(--ink)',
                    letterSpacing: -0.2,
                  }}
                >
                  {synergy.title}
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: `${getTagColor(synergy.tag)}22`,
                    color: getTagColor(synergy.tag),
                    flexShrink: 0,
                  }}
                >
                  {synergy.tag}
                </span>
              </div>

              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>
                🔗 {synergy.cardsInvolved}
              </div>

              <p
                style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}
              >
                {synergy.explanation}
              </p>

              <div
                style={{
                  marginTop: 10,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  border: '0.5px dashed var(--border)',
                  fontSize: 11,
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}
              >
                💡 Recomendación: {synergy.recommendation}
              </div>
            </Surface>
          ))}
        </div>
      ) : (
        <div
          style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}
        >
          No hay sugerencias disponibles en este momento.
        </div>
      )}

      <style>{`
        @keyframes synergyShimmer {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.65; }
        }
      `}</style>
    </div>
  );
}
