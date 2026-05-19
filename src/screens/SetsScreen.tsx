import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Surface from '@/components/Surface';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { ChevronIcon, BookIcon } from '@/components/icons';
import { useAsync, useCollection } from '@/lib/hooks';
import { getSets } from '@/lib/pokemonTcgApi';
import { formatDateShort, stringHue } from '@/lib/formatters';
import type { CardSet } from '@/types/pokemon';

interface SetWithCounts {
  set: CardSet;
  ownedFromSet: number;
}

/**
 * Sets / Expansiones browser. Lists all Pokémon TCG sets with completion
 * progress based on the user's collection (cardId encodes setId via the API's
 * `setId-cardNumber` format, e.g. `swsh1-12`).
 */
export default function SetsScreen() {
  const navigate = useNavigate();
  const collection = useCollection();

  const setsState = useAsync<CardSet[]>(async (signal) => {
    const all = await getSets({ signal });
    // Sort by release date desc.
    return all.slice().sort((a, b) => {
      const da = a.releaseDate ?? '';
      const db = b.releaseDate ?? '';
      return db.localeCompare(da);
    });
  }, []);

  /** Count owned cards per set id by inspecting card ids in the collection. */
  const ownedBySet = useMemo(() => {
    const map = new Map<string, number>();
    for (const meta of Object.values(collection.cards)) {
      if (!meta.owned) continue;
      // Card IDs are typically `<setId>-<number>`. Split on first '-'.
      const dashIdx = meta.cardId.indexOf('-');
      if (dashIdx <= 0) continue;
      const setId = meta.cardId.slice(0, dashIdx);
      map.set(setId, (map.get(setId) ?? 0) + 1);
    }
    return map;
  }, [collection]);

  const enriched: SetWithCounts[] = useMemo(() => {
    if (!setsState.data) return [];
    return setsState.data.map((set) => ({
      set,
      ownedFromSet: ownedBySet.get(set.id) ?? 0,
    }));
  }, [setsState.data, ownedBySet]);

  const totalSets = setsState.data?.length ?? 0;
  const totalCards = useMemo(() => {
    if (!setsState.data) return 0;
    return setsState.data.reduce((s, set) => s + (set.total ?? set.printedTotal ?? 0), 0);
  }, [setsState.data]);

  return (
    <div style={{ paddingBottom: 110 }}>
      {/* Header */}
      <div style={{ padding: '54px 18px 16px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: -0.6,
          }}
        >
          Expansiones
        </h1>
        {setsState.data && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {totalSets} series · {totalCards.toLocaleString('es-ES')} cartas en total
          </div>
        )}
      </div>

      {/* Loading */}
      {setsState.loading && !setsState.data && (
        <div style={{ padding: '0 14px' }}>
          <LoadingState variant="inline" message="Cargando expansiones…" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SetRowSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {setsState.error && !setsState.data && (
        <div style={{ padding: '24px 18px' }}>
          <ErrorState
            message={setsState.error}
            onRetry={() => setsState.reload()}
          />
        </div>
      )}

      {/* Empty */}
      {setsState.data && setsState.data.length === 0 && (
        <div style={{ padding: '48px 18px' }}>
          <EmptyState
            icon={<BookIcon size={42} />}
            title="No hay expansiones"
            description="No pudimos cargar el listado de series. Vuelve a intentarlo más tarde."
          />
        </div>
      )}

      {/* List */}
      {enriched.length > 0 && (
        <div
          style={{
            padding: '0 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {enriched.map(({ set, ownedFromSet }) => (
            <SetRow
              key={set.id}
              set={set}
              ownedFromSet={ownedFromSet}
              onClick={() => navigate(`/library?set=${encodeURIComponent(set.id)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SetRow({
  set,
  ownedFromSet,
  onClick,
}: {
  set: CardSet;
  ownedFromSet: number;
  onClick: () => void;
}) {
  const total = set.total ?? set.printedTotal ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((ownedFromSet / total) * 100)) : 0;
  const hue = stringHue(set.id);
  const fallbackBg = `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 60% 35%))`;

  return (
    <Surface
      onClick={onClick}
      style={{ padding: 16, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <SetLogoTile set={set} fallbackBg={fallbackBg} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: -0.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {set.name}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {set.series}
            {set.releaseDate ? ` · ${formatDateShort(set.releaseDate)}` : ''}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginTop: 2,
            }}
          >
            {ownedFromSet}
            {total > 0 ? `/${total}` : ''} cartas
            {total > 0 ? ` · ${pct}% completo` : ''}
          </div>
        </div>
        <span style={{ color: 'var(--muted-3)' }}>
          <ChevronIcon size={16} />
        </span>
      </div>
      {total > 0 && (
        <div
          style={{
            marginTop: 12,
            height: 6,
            background: 'var(--bg)',
            borderRadius: 999,
            overflow: 'hidden',
            border: '0.5px solid var(--hairline)',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: `hsl(${hue} 65% 50%)`,
              borderRadius: 999,
              transition: 'width 240ms ease',
            }}
          />
        </div>
      )}
    </Surface>
  );
}

function SetLogoTile({
  set,
  fallbackBg,
}: {
  set: CardSet;
  fallbackBg: string;
}) {
  const logo = set.images?.logo;
  const symbol = set.images?.symbol;

  if (logo) {
    return (
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: '#fff',
          border: '0.5px solid var(--hairline)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6,
          flexShrink: 0,
        }}
      >
        <img
          src={logo}
          alt=""
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
          loading="lazy"
          onError={(e) => {
            // Hide broken image, falls back to nothing — could swap to colored tile
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        background: fallbackBg,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {symbol ? (
        <img
          src={symbol}
          alt=""
          style={{
            maxWidth: '60%',
            maxHeight: '60%',
            objectFit: 'contain',
            filter: 'brightness(0) invert(1)',
          }}
          loading="lazy"
        />
      ) : (
        set.name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

function SetRowSkeleton() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 18,
        padding: 16,
        border: '0.5px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: 'linear-gradient(110deg, #EAECF1 8%, #F2F4F7 18%, #EAECF1 33%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s linear infinite',
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            height: 14,
            width: '60%',
            borderRadius: 6,
            background:
              'linear-gradient(110deg, #EAECF1 8%, #F2F4F7 18%, #EAECF1 33%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s linear infinite',
          }}
        />
        <div
          style={{
            marginTop: 8,
            height: 10,
            width: '40%',
            borderRadius: 6,
            background:
              'linear-gradient(110deg, #EAECF1 8%, #F2F4F7 18%, #EAECF1 33%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s linear infinite',
          }}
        />
      </div>
    </div>
  );
}
