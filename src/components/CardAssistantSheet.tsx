import { useCallback, useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import { CloseIcon, InfoIcon } from './icons';
import type {
  AssistantAnswer,
  CardAssistantContext,
  AssistantIntent,
  SuggestedPrompt,
} from '@/lib/cardAssistant';
import {
  SUGGESTED_PROMPTS,
  answerCardQuestion,
  answerSuggestedPrompt,
} from '@/lib/cardAssistant';

export interface CardAssistantSheetProps {
  open: boolean;
  onClose: () => void;
  context: CardAssistantContext | null;
}

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  unknown?: boolean;
  pending?: boolean;
  intent?: AssistantIntent;
}

const INITIAL_GREETING_ID = 'greeting';

/**
 * CardAssistantSheet — a bottom sheet chat scoped to the current card.
 *
 * The assistant only answers using data already in `context`. No network
 * requests, no LLM. See `lib/cardAssistant.ts` for the routing logic and the
 * v2 LLM integration plan.
 */
export default function CardAssistantSheet({
  open,
  onClose,
  context,
}: CardAssistantSheetProps) {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the sheet opens with a fresh card.
  useEffect(() => {
    if (!open || !context) return;
    setMessages([
      {
        id: INITIAL_GREETING_ID,
        role: 'assistant',
        text: `Soy tu asistente para **${context.card.name}**. Te puedo contar sobre rareza, valor estimado, expansión, ataques, variantes y si la tienes en tu colección.`,
        sources: ['CardDex · Asistente local'],
      },
    ]);
    setInput('');
    // Wait one tick before focusing so iOS Safari doesn't immediately blur.
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open, context]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const ask = useCallback(
    async (question: string) => {
      if (!context) return;
      const trimmed = question.trim();
      if (!trimmed) return;

      const userId = `u${Date.now()}`;
      const newMessages = [...messages, { id: userId, role: 'user' as const, text: trimmed }];
      setMessages(newMessages);
      setInput('');
      setThinking(true);

      try {
        const apiMessages = newMessages.map(m => ({ role: m.role, content: m.text }));
        
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            collectionStats: {
              cardName: context.card.name,
              setName: context.card.set?.name,
              estimatedPrice: context.estimatedPrice,
              collectionMeta: context.collectionMeta,
              cardDetails: {
                hp: context.card.hp,
                types: context.card.types,
                attacks: context.card.attacks,
                abilities: context.card.abilities,
                weaknesses: context.card.weaknesses,
                retreatCost: context.card.retreatCost
              }
            }
          })
        });
        const data = await res.json();
        
        setMessages((prev) => [
          ...prev,
          {
            id: `a${Date.now()}`,
            role: 'assistant',
            text: data.reply || 'Lo siento, no pude procesar eso.',
            sources: ['OpenAI gpt-4o-mini'],
            unknown: false,
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a${Date.now()}`,
            role: 'assistant',
            text: 'Hubo un error de conexión con la IA. Intenta de nuevo más tarde.',
            sources: ['Error de red'],
            unknown: true,
          },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [context, messages],
  );

  const askPrompt = useCallback(
    (prompt: SuggestedPrompt) => {
      if (!context) return;
      ask(prompt.label);
    },
    [ask, context],
  );

  const handleSubmit = () => ask(input);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 17, 24, 0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 220ms ease',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Asistente de carta"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          margin: '0 auto',
          background: 'var(--surface)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -8px 32px rgba(15,20,40,0.18)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 320ms cubic-bezier(.2,.8,.2,1)',
          overflow: 'hidden',
        }}
      >
        {/* Drag handle */}
        <div style={{ paddingTop: 8, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 999,
              background: 'var(--border)',
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            padding: '10px 18px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '0.5px solid var(--hairline)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--ink)',
                letterSpacing: -0.3,
              }}
            >
              Asistente de carta
            </div>
            {context && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 280,
                }}
              >
                {context.card.name} · {context.card.set?.name ?? '—'}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar asistente"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: 'none',
              background: 'var(--bg)',
              color: 'var(--ink-2)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Scroll area */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 16px 4px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 240,
          }}
        >
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              role={m.role}
              text={m.text}
              sources={m.sources}
              unknown={m.unknown}
            />
          ))}
          {thinking && <ChatMessage role="assistant" text="" pending />}

          {/* Suggested prompts shown until the user asks the first question */}
          {messages.length <= 1 && !thinking && (
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  padding: '0 4px',
                }}
              >
                Preguntas sugeridas
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => askPrompt(p)}
                    style={{
                      background: 'var(--bg)',
                      border: '0.5px solid var(--border)',
                      borderRadius: 999,
                      padding: '8px 12px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: 'var(--ink-2)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      letterSpacing: -0.1,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div
          style={{
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--muted)',
            borderTop: '0.5px solid var(--hairline)',
          }}
        >
          <InfoIcon size={12} />
          <span>
            Asistente IA (OpenAI). Las respuestas sobre mercado son estimaciones.
          </span>
        </div>

        {/* Composer */}
        <div
          style={{
            padding: '10px 12px 16px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            borderTop: '0.5px solid var(--hairline)',
            background: 'var(--surface-elev)',
          }}
        >
          <div
            style={{
              flex: 1,
              background: 'var(--bg)',
              borderRadius: 16,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              border: '0.5px solid var(--border-soft)',
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe una pregunta…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              aria-label="Escribe una pregunta sobre la carta"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 14,
                fontFamily: 'inherit',
                color: 'var(--ink)',
              }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || thinking}
            aria-label="Enviar pregunta"
            style={{
              background: input.trim() && !thinking ? 'var(--accent)' : 'var(--border)',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              padding: '0 16px',
              height: 44,
              fontWeight: 700,
              fontSize: 14,
              fontFamily: 'inherit',
              cursor: input.trim() && !thinking ? 'pointer' : 'default',
              letterSpacing: -0.1,
              transition: 'background 200ms',
            }}
          >
            Enviar
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
