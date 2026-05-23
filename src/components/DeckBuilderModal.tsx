import { useState, useRef, useEffect } from 'react';
import { createDeck, updateDeckCards } from '@/lib/deckStorage';
import { searchCards } from '@/lib/pokemonTcgApi';
import { triggerHaptic } from '@/lib/haptic';
import { SparklesIcon } from '@/components/icons';
import { processAchievementEvent } from '@/lib/achievements';
import { dispatchAchievement } from '@/app/App';

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
  const [phase, setPhase] = useState<'idle' | 'streaming' | 'resolving' | 'saving'>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [resolveStatus, setResolveStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Copilot chat state (post-generation)
  const [deckSpec, setDeckSpec] = useState<any>(null);
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStreamText, setChatStreamText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatStreamText]);

  if (!isOpen) return null;

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setPhase('streaming');
    setStreamedText('');
    setResolveStatus('');
    triggerHaptic('medium');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/deck-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error('Error al conectar con la IA de construcción de mazos.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let deckSpec: any = null;

      // Read the SSE stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: token')) continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                // Typewriter: append streamed token to text
                setStreamedText((prev) => prev + parsed.token);
              } else if (parsed.name && parsed.cards) {
                // Final deck spec received from 'done' event
                deckSpec = parsed;
                setDeckSpec(parsed); // Save for copilot chat
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }

        if (deckSpec) break;
      }

      if (!deckSpec) {
        throw new Error('No se pudo obtener la propuesta del mazo de la IA.');
      }

      // Phase 2: Resolve card names to official TCG IDs
      setPhase('resolving');
      const resolvedCardIds: string[] = [];

      for (const card of deckSpec.cards) {
        setResolveStatus(`Buscando: ${card.name} (×${card.quantity})…`);
        try {
          const searchRes = await searchCards({ name: `"${card.name}"`, pageSize: 1 });
          const found =
            searchRes.data?.[0] ?? (await searchCards({ name: card.name, pageSize: 1 })).data?.[0];
          if (found) {
            for (let i = 0; i < card.quantity; i++) resolvedCardIds.push(found.id);
          }
        } catch {
          // Card resolution failed — skip silently
        }
      }

      if (resolvedCardIds.length === 0) {
        throw new Error('No se pudo encontrar ninguna de las cartas propuestas por la IA.');
      }

      // Phase 3: Save deck
      setPhase('saving');
      const newDeckName = deckSpec.name || 'Mazo IA Personalizado';
      const created = createDeck(newDeckName);
      updateDeckCards(created.id, resolvedCardIds);

      triggerHaptic('success');

      // Fire ai_deck_builder achievement
      const achieved = processAchievementEvent({ type: 'deck_built_with_ai' });
      achieved.forEach(dispatchAchievement);

      onShowToast(`🏆 Mazo "${newDeckName}" creado con ${resolvedCardIds.length} cartas.`);
      onSuccess(created.id);
      // Stay open in copilot mode instead of closing
      // onClose() — now we switch to chat mode
      setChatHistory([
        {
          role: 'assistant',
          content: `¡Mazo **${newDeckName}** creado con éxito! 🎉 Tiene ${resolvedCardIds.length} cartas. ¿Quieres que lo refinemos juntos? Puedes preguntarme sobre sinergias, pedirme cambios de cartas o preguntar por estrategias.`,
        },
      ]);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onShowToast(err.message || 'Error construyendo el mazo.');
      }
    } finally {
      setLoading(false);
      setPhase('idle');
      setStreamedText('');
      setResolveStatus('');
    }
  };

  const handleChatSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading || !deckSpec) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatLoading(true);
    setChatStreamText('');
    triggerHaptic('light');

    const newHistory = [...chatHistory, { role: 'user' as const, content: userMsg }];
    setChatHistory(newHistory);

    try {
      const res = await fetch('/api/deck-refiner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentDeck: deckSpec,
          userMessage: userMsg,
          history: chatHistory,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Error al conectar con el copiloto.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: token')) continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                setChatStreamText((prev) => prev + parsed.token);
              } else if (parsed.fullText) {
                finalText = parsed.fullText;
              }
            } catch {
              /* skip */
            }
          }
        }
      }

      const assistantMsg = finalText || chatStreamText;
      setChatHistory((prev) => [...prev, { role: 'assistant', content: assistantMsg }]);
      setChatStreamText('');
      triggerHaptic('success');
    } catch (err: any) {
      onShowToast(err.message || 'Error en el copiloto de mazos.');
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: '❌ Error al contactar el copiloto. Intenta de nuevo.' },
      ]);
    } finally {
      setChatLoading(false);
      setChatStreamText('');
    }
  };

  const phaseLabel =
    phase === 'streaming'
      ? '✦ IA diseñando arquetipo…'
      : phase === 'resolving'
        ? resolveStatus || 'Resolviendo cartas oficiales…'
        : phase === 'saving'
          ? 'Guardando mazo en tu colección…'
          : '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
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
          maxWidth: 460,
          background: 'var(--surface)',
          borderRadius: 24,
          padding: 24,
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          border: '0.5px solid var(--border)',
          animation: 'scaleInDeckBuilder 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--accent)' }}>
              <SparklesIcon size={18} />
            </span>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--ink)',
                letterSpacing: -0.4,
              }}
            >
              AI Deck Builder Copilot
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="modal-close-btn"
            style={{
              fontSize: 14,
              opacity: loading ? 0.4 : 1,
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '20px 8px' }}>
            {/* Phase label */}
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent)',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: 'pulseDot 1s ease-in-out infinite',
                }}
              />
              {phaseLabel}
            </div>

            {/* Streaming typewriter text box */}
            {phase === 'streaming' && streamedText && (
              <div
                style={{
                  background: 'var(--bg)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  fontSize: 12.5,
                  color: 'var(--ink)',
                  fontFamily: 'monospace',
                  lineHeight: 1.6,
                  maxHeight: 180,
                  overflowY: 'auto',
                  marginBottom: 16,
                  border: '1px solid var(--border)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {streamedText}
                <span
                  style={{
                    display: 'inline-block',
                    width: 2,
                    height: 14,
                    background: 'var(--accent)',
                    marginLeft: 2,
                    animation: 'blinkCursor 0.7s step-end infinite',
                    verticalAlign: 'text-bottom',
                  }}
                />
              </div>
            )}

            {/* Progress spinner for resolve/save phases */}
            {(phase === 'resolving' || phase === 'saving') && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: '3px solid var(--border)',
                    borderTopColor: 'var(--accent)',
                    animation: 'spinDeckBuilder 1s linear infinite',
                    margin: '0 auto 12px',
                  }}
                />
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {resolveStatus || 'Procesando…'}
                </div>
              </div>
            )}

            {/* Steps indicator */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {[
                { key: 'streaming', label: '1. IA diseña' },
                { key: 'resolving', label: '2. Resuelve cartas' },
                { key: 'saving', label: '3. Guarda mazo' },
              ].map((s) => (
                <div
                  key={s.key}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 99,
                    background:
                      phase === s.key
                        ? 'var(--accent)'
                        : (phase === 'resolving' && s.key === 'streaming') ||
                            (phase === 'saving' && s.key !== 'saving')
                          ? 'rgba(123,90,217,0.35)'
                          : 'var(--border)',
                    transition: 'background 400ms ease',
                  }}
                  title={s.label}
                />
              ))}
            </div>
          </div>
        ) : chatHistory.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: 360 }}>
            {/* Header chat mode */}
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--accent)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                }}
              >
                ✦ Deck Copilot — Modo Refinamiento
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Habla con la IA para refinar tu mazo
              </div>
            </div>
            {/* Chat messages */}
            <div
              className="no-scrollbar"
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                paddingRight: 4,
                marginBottom: 12,
              }}
            >
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background:
                      msg.role === 'user'
                        ? 'linear-gradient(135deg, #7B5AD9, #2F6FE0)'
                        : 'var(--bg)',
                    color: msg.role === 'user' ? '#fff' : 'var(--ink)',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '10px 14px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    border: msg.role === 'assistant' ? '0.5px solid var(--border)' : 'none',
                    boxShadow: msg.role === 'user' ? '0 2px 8px rgba(123,90,217,0.3)' : 'none',
                  }}
                >
                  {msg.content}
                </div>
              ))}
              {chatStreamText && (
                <div
                  style={{
                    alignSelf: 'flex-start',
                    maxWidth: '85%',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    borderRadius: '16px 16px 16px 4px',
                    padding: '10px 14px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    border: '0.5px solid var(--border)',
                  }}
                >
                  {chatStreamText}
                  <span
                    style={{
                      display: 'inline-block',
                      width: 2,
                      height: 13,
                      background: 'var(--accent)',
                      marginLeft: 2,
                      animation: 'blinkCursor 0.7s step-end infinite',
                      verticalAlign: 'text-bottom',
                    }}
                  />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            {/* Chat input */}
            <form onSubmit={handleChatSend} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Cambia los Pidgeot ex por Lumineon V..."
                disabled={chatLoading}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  opacity: chatLoading ? 0.6 : 1,
                }}
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="modal-send-btn"
                style={{
                  padding: '10px 16px',
                  borderRadius: 12,
                  fontWeight: 700,
                  cursor: chatLoading ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  opacity: !chatInput.trim() || chatLoading ? 0.5 : 1,
                }}
              >
                {chatLoading ? '…' : '↑'}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleGenerate}>
            <p
              style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}
            >
              Escribe qué tipo de mazo te gustaría armar. La IA diseñará la lista de 60 cartas
              perfecta con sinergias avanzadas y la verás en tiempo real.
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
              className="modal-primary-btn"
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 14,
                fontSize: 15,
                letterSpacing: -0.2,
              }}
            >
              <SparklesIcon size={17} />
              Generar Mazo con IA
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
        @keyframes blinkCursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes pulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
