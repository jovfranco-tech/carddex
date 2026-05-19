import { useNavigate, useParams } from 'react-router-dom';
import Surface from '@/components/Surface';
import { useDecks } from '@/lib/hooks';
import { BackIcon } from '@/components/icons';

export default function DeckDetailScreen() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const decksState = useDecks();
  const deck = deckId ? decksState.decks[deckId] : undefined;

  if (!deck) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div>Mazo no encontrado</div>
        <button onClick={() => navigate(-1)} style={{ marginTop: 20 }}>Volver</button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 110 }}>
      {/* Top bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          padding: '54px 14px 10px',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: 'var(--surface)',
            border: '0.5px solid var(--border)',
            color: 'var(--ink-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <BackIcon size={18} />
        </button>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--ink)',
            letterSpacing: -0.3,
          }}
        >
          {deck.name}
        </div>
        <div style={{ width: 38 }} />
      </div>

      <div style={{ padding: '20px 18px' }}>
        <Surface style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>
            {deck.cards.length} / 60
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Cartas en el mazo
          </div>
          
          <p style={{ marginTop: 20, color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
            ¡La funcionalidad completa de editar el mazo y agregar cartas está en desarrollo! 
            En próximas versiones podrás probar manos iniciales y agregar cartas desde tu biblioteca.
          </p>
        </Surface>
      </div>
    </div>
  );
}
