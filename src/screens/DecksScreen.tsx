import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Surface from '@/components/Surface';
import { useDecks } from '@/lib/hooks';
import { createDeck, deleteDeck } from '@/lib/deckStorage';
import { PlusIcon, TrashIcon } from '@/components/icons';
import { ROUTES } from '@/app/routes';
import DeckBuilderModal from '@/components/DeckBuilderModal';
import { Toast } from '@/components/Section';
import { useI18n } from '@/lib/i18n';

export default function DecksScreen() {
  const decksState = useDecks();
  const navigate = useNavigate();
  const [newDeckName, setNewDeckName] = useState('');
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const decks = Object.values(decksState.decks).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    const deck = createDeck(newDeckName.trim());
    setNewDeckName('');
    navigate(ROUTES.deckDetail(deck.id));
  };

  const { t } = useI18n();

  return (
    <div style={{ padding: '54px 18px 110px' }}>
      <h1
        style={{
          margin: '0 0 24px',
          fontSize: 26,
          fontWeight: 800,
          color: 'var(--ink)',
          letterSpacing: -0.6,
        }}
      >
        {t('decks.title')}
      </h1>

      <Surface style={{ padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{t('decks.createNew')}</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder={t('decks.placeholder')}
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid var(--hairline)',
              background: 'var(--bg)',
              color: 'var(--ink)',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0 16px',
              borderRadius: 12,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <PlusIcon size={20} />
          </button>
        </form>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setIsBuilderOpen(true)}
            style={{
              width: '100%',
              background: 'var(--accent-tint)',
              border: 'none',
              color: 'var(--accent)',
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 200ms ease',
            }}
          >
            <span>{t('decks.copilot')}</span>
          </button>
        </div>
      </Surface>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {decks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            {t('decks.empty')}
          </div>
        ) : (
          decks.map((deck) => (
            <Surface key={deck.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  gap: 12,
                }}
              >
                <div 
                  onClick={() => navigate(ROUTES.deckDetail(deck.id))}
                  style={{ flex: 1, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                    {deck.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {t('decks.cardCount', { count: deck.cards.length })}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(t('decks.deleteConfirm'))) {
                      deleteDeck(deck.id);
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--error)',
                    padding: 8,
                    cursor: 'pointer',
                  }}
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            </Surface>
          ))
        )}
      </div>

      <DeckBuilderModal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onSuccess={(id) => navigate(ROUTES.deckDetail(id))}
        onShowToast={(msg) => setToastMsg(msg)}
      />

      <Toast
        message={toastMsg ?? ''}
        visible={!!toastMsg}
        onHide={() => setToastMsg(null)}
        duration={3000}
      />
    </div>
  );
}
