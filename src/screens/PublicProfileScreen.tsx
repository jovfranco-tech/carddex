import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import Surface from '@/components/Surface';
import CardTile from '@/components/CardTile';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { getCardsByIds } from '@/lib/pokemonTcgApi';
import type { CollectionState } from '@/types/collection';
import { BackIcon, BookmarkIcon } from '@/components/icons';

export default function PublicProfileScreen() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<CollectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      if (!userId) return;
      try {
        const { data, error } = await supabase
          .from('collections')
          .select('state')
          .eq('user_id', userId)
          .single();

        if (error) {
          throw new Error('No se pudo encontrar el perfil público o es privado.');
        }

        setCollection(data.state as CollectionState);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [userId]);

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
          Perfil Público
        </div>
        <div style={{ width: 38 }} />
      </div>

      {loading ? (
        <LoadingState variant="grid" count={6} />
      ) : error || !collection ? (
        <ErrorState message={error ?? 'Perfil no encontrado.'} onRetry={() => window.location.reload()} />
      ) : (
        <div style={{ padding: '0 14px' }}>
          <Surface style={{ padding: 20, textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 40 }}>👤</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 12 }}>Entrenador</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>ID: {userId?.slice(0, 8)}...</div>
          </Surface>

          <WishlistSection collection={collection} />
        </div>
      )}
    </div>
  );
}

function WishlistSection({ collection }: { collection: CollectionState }) {
  const wishlistIds = Object.values(collection.cards)
    .filter((c) => c.wishlist)
    .map((c) => c.cardId);

  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (wishlistIds.length === 0) {
        setLoading(false);
        return;
      }
      try {
        const data = await getCardsByIds(wishlistIds);
        setCards(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [wishlistIds.join(',')]);

  if (loading) return <LoadingState message="Cargando wishlist..." />;

  return (
    <Surface style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BookmarkIcon size={20} color="var(--purple)" />
        <div style={{ fontSize: 16, fontWeight: 800 }}>Wishlist / Buscando</div>
      </div>

      {cards.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          Este usuario no tiene cartas en su Wishlist.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {cards.map((c) => (
            <CardTile key={c.id} card={c} meta={collection.cards[c.id]} width={104} />
          ))}
        </div>
      )}
    </Surface>
  );
}
