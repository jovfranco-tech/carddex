import { type ReactNode } from 'react';

export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  text: string;
  sources?: string[];
  pending?: boolean;
  unknown?: boolean;
}

/**
 * Render a single chat bubble. Markdown is intentionally NOT supported — we
 * keep formatting minimal (paragraphs + soft **bold**) so the assistant feels
 * grounded rather than chatty.
 */
export default function ChatMessage({
  role,
  text,
  sources,
  pending,
  unknown,
}: ChatMessageProps) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        padding: '4px 0',
      }}
    >
      <div
        style={{
          maxWidth: '82%',
          background: isUser ? 'var(--accent)' : 'var(--bg)',
          color: isUser ? '#fff' : 'var(--ink)',
          border: isUser ? 'none' : '0.5px solid var(--border-soft)',
          borderRadius: 18,
          padding: '10px 14px',
          fontSize: 14,
          lineHeight: 1.45,
          letterSpacing: -0.1,
          boxShadow: isUser ? 'var(--shadow-accent)' : 'none',
          whiteSpace: 'pre-wrap',
        }}
      >
        {pending ? <TypingDots /> : renderBoldMarkdown(text)}
        {!pending && sources && sources.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {sources.map((src) => (
              <span
                key={src}
                style={{
                  fontSize: 10.5,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: isUser
                    ? 'rgba(255,255,255,0.18)'
                    : 'var(--accent-tint)',
                  color: isUser ? '#fff' : 'var(--accent)',
                  fontWeight: 600,
                  letterSpacing: -0.05,
                }}
              >
                {src}
              </span>
            ))}
          </div>
        )}
        {unknown && !pending && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: isUser ? 'rgba(255,255,255,0.7)' : 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            (sin datos disponibles para esta pregunta)
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render a string with very light Markdown — **bold** only, on purpose.
 * Splits on **…** runs and emits <strong> nodes.
 */
function renderBoldMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={`b${i}`} style={{ fontWeight: 700 }}>
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function TypingDots() {
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: '2px 4px',
        alignItems: 'center',
      }}
      aria-label="Pensando…"
    >
      <Dot delay={0} />
      <Dot delay={140} />
      <Dot delay={280} />
      <style>{`
        @keyframes carddexTypingDot {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </span>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: 'var(--muted)',
        display: 'inline-block',
        animation: `carddexTypingDot 1.2s ease-in-out ${delay}ms infinite`,
      }}
    />
  );
}
