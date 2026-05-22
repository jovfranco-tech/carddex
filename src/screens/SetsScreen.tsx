import { useState, useMemo, useEffect, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { VirtuosoGrid } from 'react-virtuoso';
import Surface from '@/components/Surface';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { ChevronIcon, BookIcon } from '@/components/icons';
import { useAsync, useCollection } from '@/lib/hooks';
import { getSets, getCardsBySet } from '@/lib/pokemonTcgApi';
import { formatDateShort, stringHue } from '@/lib/formatters';
import type { CardSet, PokemonCard } from '@/types/pokemon';
import { saveCardMeta, removeCard } from '@/lib/collectionStorage';
import { triggerHaptic } from '@/lib/haptic';
import TcgCardImage from '@/components/TcgCardImage';
import { prefetchImages } from '@/lib/imagePreloader';
import { getOptimizedImageUrl } from '@/lib/imageOptimization';

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

  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

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
              isExpanded={expandedSetId === set.id}
              onToggleExpand={() => {
                triggerHaptic('light');
                setExpandedSetId(expandedSetId === set.id ? null : set.id);
              }}
              collection={collection}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SetChecklist({
  setId,
  collection,
}: {
  setId: string;
  collection: any;
}) {
  const navigate = useNavigate();
  const { data: cards, loading, error } = useAsync(async (signal) => {
    const res = await getCardsBySet(setId, 1, 250, { signal });
    return res.data;
  }, [setId]);

  useEffect(() => {
    if (!cards || cards.length === 0) return;

    // Filter first 12 cards not owned by the user
    const unownedCards = cards
      .filter((c) => !collection.cards[c.id]?.owned)
      .slice(0, 12);

    const urlsToPrefetch: string[] = [];
    unownedCards.forEach((c) => {
      if (c.images) {
        if (c.images.small) {
          urlsToPrefetch.push(getOptimizedImageUrl(c.images.small, 110));
        }
        if (c.images.large) {
          urlsToPrefetch.push(getOptimizedImageUrl(c.images.large, 240));
        }
      }
    });

    if (urlsToPrefetch.length > 0) {
      prefetchImages(urlsToPrefetch);
    }
  }, [cards, collection.cards]);

  const handleToggle = (card: PokemonCard, isOwned: boolean) => {
    triggerHaptic('light');
    if (isOwned) {
      removeCard(card.id);
    } else {
      saveCardMeta(card.id, {
        owned: true,
        quantity: 1,
        foil: false,
        condition: 'Near Mint',
        variant: 'Normal',
      });
    }
  };

  const handleIncrement = (card: PokemonCard, currentQty: number) => {
    triggerHaptic('light');
    saveCardMeta(card.id, {
      owned: true,
      quantity: currentQty + 1,
      foil: collection.cards[card.id]?.foil ?? false,
      condition: collection.cards[card.id]?.condition ?? 'Near Mint',
      variant: collection.cards[card.id]?.variant ?? 'Normal',
    });
  };

  const handleDecrement = (card: PokemonCard, currentQty: number) => {
    triggerHaptic('light');
    if (currentQty <= 1) {
      removeCard(card.id);
    } else {
      saveCardMeta(card.id, {
        owned: true,
        quantity: currentQty - 1,
        foil: collection.cards[card.id]?.foil ?? false,
        condition: collection.cards[card.id]?.condition ?? 'Near Mint',
        variant: collection.cards[card.id]?.variant ?? 'Normal',
      });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px 0' }}>
        <LoadingState variant="inline" message="Cargando Álbum..." />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'var(--error)', fontSize: 12.5, padding: '12px 0', textAlign: 'center' }}>
        ⚠️ {error}
      </div>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: 12, padding: '12px 0', textAlign: 'center' }}>
        No se encontraron cartas en esta expansión.
      </div>
    );
  }

  return (
    <VirtuosoGrid
      style={{
        height: 360,
        marginTop: 12,
      }}
      data={cards}
      components={{
        List: forwardRef<HTMLDivElement, any>(({ style, children, ...props }, ref) => (
          <div
            ref={ref}
            {...props}
            style={{
              ...style,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
              gap: '20px 12px',
              justifyItems: 'center',
              padding: '8px 4px',
            }}
          >
            {children}
          </div>
        )),
        Item: ({ children, ...props }) => (
          <div
            {...props}
            style={{
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
              position: 'relative',
            }}
          >
            {children}
          </div>
        ),
      }}
      itemContent={(index, card) => {
        const cardMeta = collection.cards[card.id];
        const isOwned = Boolean(cardMeta?.owned);
        const qty = cardMeta?.quantity ?? 0;

        return (
          <div
            style={{
              position: 'relative',
              width: 78,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            {/* Card Thumbnail */}
            <TcgCardImage
              card={card}
              width={78}
              onClick={() => navigate(`/card/${encodeURIComponent(card.id)}`)}
              style={{
                filter: isOwned ? 'none' : 'grayscale(1) opacity(0.38)',
                transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                transform: isOwned ? 'none' : 'scale(0.96)',
              }}
            />

            {/* Floating add button if not owned */}
            {!isOwned && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(card, false);
                }}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: '1.5px solid var(--surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  zIndex: 10,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.15)';
                  e.currentTarget.style.background = 'var(--accent-hover, var(--accent))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.background = 'var(--accent)';
                }}
              >
                +
              </button>
            )}

            {/* Owned indicators */}
            {isOwned && (
              <>
                {/* Quantity badge top-left */}
                <div
                  style={{
                    position: 'absolute',
                    top: -6,
                    left: -6,
                    background: 'linear-gradient(135deg, #7B5AD9 0%, #2F6FE0 100%)',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 8,
                    border: '1.5px solid var(--surface)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    zIndex: 10,
                    pointerEvents: 'none',
                  }}
                >
                  ×{qty}
                </div>

                {/* Compact +/- footer buttons */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: -8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 4px',
                    boxShadow: '0 3px 8px rgba(0,0,0,0.25)',
                    zIndex: 10,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleDecrement(card, qty)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--bg-soft, rgba(0,0,0,0.06))',
                      border: 'none',
                      color: 'var(--ink)',
                      fontSize: 11,
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                  >
                    -
                  </button>
                  <button
                    onClick={() => handleIncrement(card, qty)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--bg-soft, rgba(0,0,0,0.06))',
                      border: 'none',
                      color: 'var(--ink)',
                      fontSize: 11,
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.1s ease',
                    }}
                  >
                    +
                  </button>
                </div>
              </>
            )}
          </div>
        );
      }}
    />
  );
}

function SetRow({
  set,
  ownedFromSet,
  isExpanded,
  onToggleExpand,
  collection,
}: {
  set: CardSet;
  ownedFromSet: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  collection: any;
}) {
  const navigate = useNavigate();
  const total = set.total ?? set.printedTotal ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((ownedFromSet / total) * 100)) : 0;
  const hue = stringHue(set.id);
  const fallbackBg = `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 60% 35%))`;

  return (
    <Surface
      style={{
        padding: 16,
        contentVisibility: 'auto',
        containIntrinsicSize: isExpanded ? '0 450px' : '0 88px',
      }}
    >
      <div onClick={onToggleExpand} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
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
        <span
          style={{
            color: 'var(--muted-3)',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
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

      {isExpanded && (
        <div style={{ marginTop: 12, borderTop: '0.5px solid var(--border-soft)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/library?set=${encodeURIComponent(set.id)}`);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
              }}
            >
              Ver en la Biblioteca ↗
            </button>
          </div>
          <SetChecklist setId={set.id} collection={collection} />
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
