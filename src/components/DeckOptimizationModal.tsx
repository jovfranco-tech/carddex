import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { PokemonCard } from '@/types/pokemon';
import { triggerHaptic } from '@/lib/haptic';
import ChatMessage from '@/components/ChatMessage';

interface DeckOptimizationModalProps {
  deck: { id: string; name: string; cards: string[] };
  deckCards: PokemonCard[];
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export default function DeckOptimizationModal({
  deck,
  deckCards,
  isOpen,
  onClose,
}: DeckOptimizationModalProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'ai'>('stats');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Calculate deck composition stats
  const stats = useMemo(() => {
    let pokemon = 0;
    let trainer = 0;
    let energy = 0;
    const typesMap: Record<string, number> = {};

    deck.cards.forEach((id) => {
      const card = deckCards.find((c) => c.id === id);
      if (!card) return;

      if (card.supertype === 'Pokémon') {
        pokemon += 1;
        card.types?.forEach((t) => {
          typesMap[t] = (typesMap[t] || 0) + 1;
        });
      } else if (card.supertype === 'Trainer') {
        trainer += 1;
      } else if (card.supertype === 'Energy') {
        energy += 1;
      }
    });

    const total = deck.cards.length || 1;
    return {
      pokemon,
      trainer,
      energy,
      pokemonPct: Math.round((pokemon / total) * 100),
      trainerPct: Math.round((trainer / total) * 100),
      energyPct: Math.round((energy / total) * 100),
      types: Object.entries(typesMap).map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / (pokemon || 1)) * 100),
      })),
    };
  }, [deck, deckCards]);

  // AI request trigger
  const runOptimization = async () => {
    if (loading) return;
    setLoading(true);
    setActiveTab('ai');
    triggerHaptic('light');

    // Build the query listing cards and current structure
    const cardsSummary = deckCards
      .map((c) => {
        const qty = deck.cards.filter((id) => id === c.id).length;
        return `- ${c.name} (${c.supertype}${c.types ? `, tipo: ${c.types.join('/')}` : ''}) x${qty}`;
      })
      .join('\n');

    const prompt = `Analiza mi mazo "${deck.name}" compuesto por las siguientes cartas:\n${cardsSummary}\n\nPor favor:\n1. Evalúa la consistencia de la proporción Pokémon (${stats.pokemon}), Entrenadores (${stats.trainer}) y Energías (${stats.energy}).\n2. Identifica sinergias clave entre los ataques/habilidades de estas cartas.\n3. Señala puntos débiles o cartas redundantes.\n4. Recomienda 3 o 4 cartas específicas para optimizar el mazo.`;

    const userMessage: Message = { role: 'user', content: 'Optimiza mi mazo' };
    setMessages([userMessage]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: prompt }
          ],
          collectionStats: {
            deckName: deck.name,
            pokemonCount: stats.pokemon,
            trainerCount: stats.trainer,
            energyCount: stats.energy,
            totalCards: deck.cards.length,
          }
        }),
      });

      if (!res.ok) throw new Error('Failed API response');
      const data = await res.json();
      
      setMessages([
        userMessage,
        { role: 'assistant', content: data.reply }
      ]);
      triggerHaptic('success');
    } catch (err) {
      console.error('Failed optimizing deck:', err);
      setMessages([
        userMessage,
        { role: 'assistant', content: 'Lo siento, no he podido conectar con el motor de optimización de IA en este momento. Por favor, reinténtalo más tarde.' }
      ]);
      triggerHaptic('warning');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;

    const userMsgText = inputValue.trim();
    setInputValue('');
    triggerHaptic('light');

    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMsgText }];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          collectionStats: {
            deckName: deck.name,
            pokemonCount: stats.pokemon,
            trainerCount: stats.trainer,
            energyCount: stats.energy,
            totalCards: deck.cards.length,
          }
        }),
      });

      if (!res.ok) throw new Error('API failed');
      const data = await res.json();

      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      triggerHaptic('light');
    } catch (err) {
      console.error('Failed sending message:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Hubo un error de conexión al enviar tu mensaje. Inténtalo de nuevo.' }
      ]);
      triggerHaptic('warning');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 20, 40, 0.4)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(24px) saturate(180%)',
          borderRadius: 24,
          padding: 24,
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.2)',
          border: '0.5px solid rgba(255, 255, 255, 0.4)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.4 }}>
              Optimizador de Mazo IA
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              {deck.name} ({deck.cards.length}/60 cartas)
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0, 0, 0, 0.05)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontWeight: 800,
              color: 'var(--ink-2)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.04)',
            borderRadius: 14,
            padding: 4,
            marginBottom: 20,
          }}
        >
          <button
            onClick={() => {
              setActiveTab('stats');
              triggerHaptic('light');
            }}
            style={{
              flex: 1,
              background: activeTab === 'stats' ? '#fff' : 'transparent',
              color: activeTab === 'stats' ? 'var(--ink)' : 'var(--ink-2)',
              border: 'none',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.2s',
              boxShadow: activeTab === 'stats' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Estadísticas
          </button>
          <button
            onClick={() => {
              setActiveTab('ai');
              triggerHaptic('light');
            }}
            style={{
              flex: 1,
              background: activeTab === 'ai' ? '#fff' : 'transparent',
              color: activeTab === 'ai' ? 'var(--ink)' : 'var(--ink-2)',
              border: 'none',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.2s',
              boxShadow: activeTab === 'ai' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Análisis IA
          </button>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} className="no-scrollbar">
          {activeTab === 'stats' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Composition indicators */}
              <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Composición de Cartas
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <ProgressBarLabel
                    label="Pokémon"
                    count={stats.pokemon}
                    pct={stats.pokemonPct}
                    color="#4A90E2"
                    idealRange="15-20"
                  />
                  <ProgressBarLabel
                    label="Entrenadores (Trainer)"
                    count={stats.trainer}
                    pct={stats.trainerPct}
                    color="#7B5AD9"
                    idealRange="25-35"
                  />
                  <ProgressBarLabel
                    label="Energías"
                    count={stats.energy}
                    pct={stats.energyPct}
                    color="#F5A623"
                    idealRange="8-15"
                  />
                </div>
              </div>

              {/* Types distributions */}
              {stats.types.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Distribución de Tipos Pokémon
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {stats.types.map((t) => (
                      <div
                        key={t.name}
                        style={{
                          background: 'rgba(0, 0, 0, 0.03)',
                          border: '0.5px solid var(--border)',
                          borderRadius: 12,
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{getTypeEmoji(t.name)}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                          {t.name}: {t.count} ({t.pct}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optimization Trigger CTA */}
              <button
                onClick={runOptimization}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 16,
                  padding: '14px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  marginTop: 10,
                  boxShadow: '0 8px 24px rgba(123, 90, 217, 0.25)',
                  transition: 'transform 0.15s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseOut={(e) => (e.currentTarget.style.transform = 'none')}
              >
                Generar Diagnóstico Completo con IA
              </button>
            </div>
          ) : (
            /* IA Chat Tab */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 260 }}>
              {messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 16 }}>
                  <span style={{ fontSize: 36 }}>🤖</span>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
                      El motor de IA está listo
                    </h4>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                      Haz clic abajo para analizar tus cartas, sinergias y recibir recomendaciones automáticas.
                    </p>
                  </div>
                  <button
                    onClick={runOptimization}
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 14,
                      padding: '10px 20px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Iniciar Análisis
                  </button>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {/* Messages Area */}
                  <div
                    ref={scrollRef}
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      paddingBottom: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                    className="no-scrollbar"
                  >
                    {messages.map((m, index) => (
                      <ChatMessage
                        key={index}
                        role={m.role}
                        text={m.content}
                      />
                    ))}
                    {loading && <ChatMessage role="assistant" text="" pending />}
                  </div>

                  {/* Input form */}
                  <form
                    onSubmit={handleSendMessage}
                    style={{
                      display: 'flex',
                      gap: 8,
                      borderTop: '0.5px solid var(--border)',
                      paddingTop: 12,
                      background: 'transparent',
                    }}
                  >
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Ej: ¿cómo mejoro el ataque de este mazo?"
                      disabled={loading}
                      style={{
                        flex: 1,
                        background: 'rgba(0, 0, 0, 0.04)',
                        border: '1.5px solid transparent',
                        borderRadius: 14,
                        padding: '10px 14px',
                        fontSize: 13,
                        color: 'var(--ink)',
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                    <button
                      type="submit"
                      disabled={loading || !inputValue.trim()}
                      style={{
                        background: 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 14,
                        width: 38,
                        height: 38,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        opacity: loading || !inputValue.trim() ? 0.5 : 1,
                      }}
                    >
                      ▲
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function ProgressBarLabel({
  label,
  count,
  pct,
  color,
  idealRange,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
  idealRange: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
          {count} cartas ({pct}%) · <span style={{ fontSize: 11 }}>Ideal: {idealRange}</span>
        </span>
      </div>
      <div style={{ width: '100%', height: 8, background: 'rgba(0, 0, 0, 0.05)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function getTypeEmoji(type: string): string {
  switch (type.toLowerCase()) {
    case 'fire':
    case 'fuego':
      return '🔥';
    case 'water':
    case 'agua':
      return '💧';
    case 'grass':
    case 'planta':
      return '🌿';
    case 'lightning':
    case 'rayo':
      return '⚡';
    case 'psychic':
    case 'psíquico':
      return '🔮';
    case 'fighting':
    case 'lucha':
      return '✊';
    case 'darkness':
    case 'oscuridad':
      return '🌙';
    case 'metal':
    case 'acero':
      return '🔩';
    case 'dragon':
    case 'dragón':
      return '🐲';
    case 'fairy':
    case 'hada':
      return '🌸';
    case 'colorless':
    case 'incoloro':
      return '⚪';
    default:
      return '🃏';
  }
}
