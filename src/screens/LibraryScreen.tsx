import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Surface from '@/components/Surface';
import Chip from '@/components/Chip';
import CardTile from '@/components/CardTile';
import { VirtuosoGrid } from 'react-virtuoso';
import TcgCardImage from '@/components/TcgCardImage';
import RarityBadge from '@/components/RarityBadge';
import PriceBadge from '@/components/PriceBadge';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { Section, ActionLink } from '@/components/Section';
import {
  SearchIcon,
  FilterIcon,
  GridIcon,
  ListIcon,
  LayersIcon,
  ChevronDownIcon,
  CloseIcon,
} from '@/components/icons';
import { useAsync, useCollection, useDebounced } from '@/lib/hooks';
import { getCardsByIds, searchCards } from '@/lib/pokemonTcgApi';
import { getEstimatedPrice } from '@/lib/pricing';
import SearchBar from '@/components/SearchBar';
import {
  RARITY_FILTERS,
  rarityMatchesFilter,
  raritySortWeight,
  rarityLabel,
} from '@/lib/rarity';
import { formatInt } from '@/lib/formatters';
import type { CollectionState } from '@/types/collection';
import type { PokemonCard } from '@/types/pokemon';

type SortKey = 'rarity' | 'value' | 'name' | 'recent';

const SORT_LABELS: Record<SortKey, string> = {
  rarity: 'Rareza',
  value: 'Valor',
  name: 'Nombre',
  recent: 'Recientes',
};

export default function LibraryScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const collection = useCollection();

  const setFilter = searchParams.get('set') ?? '';
  const [view, setView] = useState<'grid' | 'list' | 'sets'>('grid');
  const [onlyMine, setOnlyMine] = useState(true);
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('rarity');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const debouncedSearchQuery = useDebounced(searchQuery, 400);

  const collectionIds = useMemo(
    () =>
      Object.values(collection.cards)
        .filter((c) => c.owned)
        .map((c) => c.cardId),
    [collection],
  );

  const owned = useAsync(
    (signal) =>
      collectionIds.length
        ? getCardsByIds(collectionIds, { signal })
        : Promise.resolve([]),
    [collectionIds.join(',')],
  );

  // When viewing "all" + a set filter (or global search query), fetch the cards from the API.
  const setView$ = useAsync(async (signal) => {
    if (onlyMine) return [];
    if (!setFilter && !debouncedSearchQuery.trim()) return [];

    if (setFilter) {
      const { data } = await searchCards(
        { setId: setFilter, pageSize: 60, orderBy: 'number' },
        { signal },
      );
      return data;
    } else {
      const { data } = await searchCards(
        { name: debouncedSearchQuery.trim(), pageSize: 60, orderBy: '-set.releaseDate' },
        { signal },
      );
      return data;
    }
  }, [onlyMine, setFilter, debouncedSearchQuery]);

  const baseCards = onlyMine
    ? owned.data ?? []
    : ((setFilter || debouncedSearchQuery.trim()) ? setView$.data : null) ?? owned.data ?? [];

  const filteredCards = useMemo(() => {
    let list = baseCards;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => {
        const nameMatch = c.name.toLowerCase().includes(q);
        const numMatch = c.number?.toLowerCase().includes(q);
        const setMatch = c.set?.name?.toLowerCase().includes(q) || c.set?.id?.toLowerCase().includes(q);
        return nameMatch || numMatch || setMatch;
      });
    }

    if (setFilter) list = list.filter((c) => c.set?.id === setFilter);
    if (rarityFilter !== 'all') {
      list = list.filter((c) => rarityMatchesFilter(c.rarity, rarityFilter));
    }
    list = [...list].sort((a, b) => {
      if (sort === 'rarity') return raritySortWeight(b.rarity) - raritySortWeight(a.rarity);
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'value') {
        return (getEstimatedPrice(b)?.value ?? 0) - (getEstimatedPrice(a)?.value ?? 0);
      }
      if (sort === 'recent') {
        const da = new Date(collection.cards[a.id]?.updatedAt ?? 0).getTime();
        const db = new Date(collection.cards[b.id]?.updatedAt ?? 0).getTime();
        return db - da;
      }
      return 0;
    });
    return list;
  }, [baseCards, rarityFilter, sort, collection, setFilter, searchQuery]);

  const totalQuantity = useMemo(
    () =>
      filteredCards.reduce(
        (acc, c) => acc + (collection.cards[c.id]?.quantity ?? (onlyMine ? 1 : 0)),
        0,
      ),
    [filteredCards, collection, onlyMine],
  );

  /**
   * Group owned cards by their set. Only run when the user is viewing
   * "Por expansión" — otherwise it's wasted work on every keystroke.
   */
  const bySetGroups = useMemo(() => {
    if (view !== 'sets') return [];
    type SetGroup = {
      setId: string;
      setName: string;
      setSeries: string;
      setSymbol: string | null;
      printedTotal: number;
      cards: typeof filteredCards;
    };
    const map = new Map<string, SetGroup>();
    for (const c of filteredCards) {
      const setId = c.set?.id ?? 'unknown';
      const setName = c.set?.name ?? 'Sin expansión';
      const series = c.set?.series ?? '';
      const symbol = c.set?.images?.symbol ?? null;
      const printedTotal = c.set?.printedTotal ?? c.set?.total ?? 0;
      const g =
        map.get(setId) ?? {
          setId,
          setName,
          setSeries: series,
          setSymbol: symbol,
          printedTotal,
          cards: [] as typeof filteredCards,
        };
      g.cards.push(c);
      map.set(setId, g);
    }
    // Sort cards inside each group by printed number, then return groups
    // sorted by completion ratio descending (most progressed first).
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        cards: [...g.cards].sort((a, b) => {
          const na = Number.parseInt(a.number ?? '0', 10) || 0;
          const nb = Number.parseInt(b.number ?? '0', 10) || 0;
          return na - nb;
        }),
      }))
      .sort((a, b) => {
        const ra = a.printedTotal > 0 ? a.cards.length / a.printedTotal : 0;
        const rb = b.printedTotal > 0 ? b.cards.length / b.printedTotal : 0;
        if (rb !== ra) return rb - ra;
        return b.cards.length - a.cards.length;
      });
  }, [view, filteredCards]);

  const rarityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (owned.data ?? []).forEach((c) => {
      const key = rarityLabel(c.rarity);
      counts.set(key, (counts.get(key) ?? 0) + (collection.cards[c.id]?.quantity ?? 1));
    });
    return counts;
  }, [owned.data, collection]);

  const rarest = useMemo(() => {
    return [...(owned.data ?? [])]
      .filter((c) => raritySortWeight(c.rarity) >= 75)
      .sort((a, b) => raritySortWeight(b.rarity) - raritySortWeight(a.rarity))
      .slice(0, 8);
  }, [owned.data]);

  const loading = onlyMine ? owned.loading : owned.loading || setView$.loading;
  const error = onlyMine ? owned.error : owned.error || setView$.error;
  const reload = () => {
    owned.reload();
    setView$.reload();
  };

  /* --------------------------------------------------------------------- */

  if (loading) {
    return (
      <div style={{ paddingBottom: 110 }}>
        <Header
          onSet={!!setFilter}
          setName={setFilter}
          onClear={() => setSearchParams({})}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
        <LoadingState variant="grid" count={9} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ paddingBottom: 110 }}>
        <Header
          onSet={!!setFilter}
          setName={setFilter}
          onClear={() => setSearchParams({})}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  const showEmpty = collectionIds.length === 0;

  /* --------------------------------------------------------------------- */

  return (
    <div style={{ paddingBottom: 110 }}>
      <Header
        onSet={!!setFilter}
        setName={setFilter}
        onClear={() => setSearchParams({})}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {showEmpty ? (
        <EmptyState
          icon={<LayersIcon size={42} />}
          title="Aún no tienes cartas"
          description="Cuando guardes cartas, aparecerán aquí ordenadas por rareza."
        />
      ) : (
        <>
          {/* Sort + view */}
          <div
            style={{
              padding: '0 14px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => setSortOpen((s) => !s)}
              style={{
                flex: 1,
                background: 'var(--surface)',
                borderRadius: 14,
                border: '0.5px solid var(--border)',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Ordenar:</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                {SORT_LABELS[sort]}
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--muted-3)' }}>
                <ChevronDownIcon size={16} />
              </span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Ver:</span>
              <div
                style={{
                  display: 'flex',
                  background: '#F2F3F7',
                  borderRadius: 12,
                  padding: 3,
                  gap: 2,
                }}
              >
                {(
                  [
                    ['grid', <GridIcon size={16} />, 'Vista cuadrícula'],
                    ['list', <ListIcon size={16} />, 'Vista lista'],
                    ['sets', <LayersIcon size={16} />, 'Vista por expansión'],
                  ] as const
                ).map(([k, icon, label]) => (
                  <button
                    key={k}
                    onClick={() => setView(k)}
                    aria-label={label}
                    aria-pressed={view === k}
                    style={{
                      width: 30,
                      height: 28,
                      borderRadius: 9,
                      background: view === k ? 'var(--surface)' : 'transparent',
                      color: view === k ? 'var(--ink)' : 'var(--muted)',
                      boxShadow:
                        view === k ? '0 1px 2px rgba(15,20,40,0.08)' : 'none',
                      border: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {sortOpen && (
            <div style={{ padding: '0 14px 14px' }}>
              <Surface style={{ padding: 6 }}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setSort(k);
                      setSortOpen(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      background: sort === k ? 'var(--accent-tint)' : 'transparent',
                      color: sort === k ? 'var(--accent)' : 'var(--ink)',
                      fontSize: 14,
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: 10,
                      cursor: 'pointer',
                    }}
                  >
                    {SORT_LABELS[k]}
                  </button>
                ))}
              </Surface>
            </div>
          )}

          {/* Rarity summary */}
          {rarityCounts.size > 0 && <RaritySummary counts={rarityCounts} />}

          {/* Rarity chips */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '0 18px 14px',
            }}
            className="no-scrollbar"
          >
            {RARITY_FILTERS.map((f) => (
              <Chip
                key={f.key}
                active={rarityFilter === f.key}
                onClick={() => setRarityFilter(f.key)}
              >
                {f.label}
              </Chip>
            ))}
          </div>

          {/* Only-mine toggle */}
          <div
            style={{
              padding: '0 18px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                Solo mis cartas
              </span>
              <button
                onClick={() => setOnlyMine((o) => !o)}
                style={{
                  width: 46,
                  height: 28,
                  borderRadius: 999,
                  padding: 2,
                  background: onlyMine ? 'var(--success)' : '#E1E3EA',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 200ms',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    transform: `translateX(${onlyMine ? 18 : 0}px)`,
                    transition: 'transform 200ms',
                  }}
                />
              </button>
            </div>
            <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
              {formatInt(totalQuantity)} carta{totalQuantity === 1 ? '' : 's'}
            </span>
          </div>

          {/* Rarest */}
          {rarest.length > 0 && (
            <Section
              title="Mis cartas más raras"
              action={<ActionLink>Ver todas</ActionLink>}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  overflowX: 'auto',
                  padding: '4px 18px 12px',
                }}
                className="no-scrollbar"
              >
                {rarest.map((c) => (
                  <CardTile
                    key={c.id}
                    card={c}
                    meta={collection.cards[c.id]}
                    width={112}
                    onClick={() => navigate(`/card/${c.id}`)}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* All cards */}
          <Section title="Todas mis cartas">
            {filteredCards.length === 0 ? (
              <EmptyState
                title="Sin resultados"
                description="Cambia los filtros o desactiva 'Solo mis cartas' para ver más."
              />
            ) : view === 'sets' ? (
              <div
                style={{
                  padding: '0 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                {bySetGroups.map((group) => (
                  <SetGroupCard
                    key={group.setId}
                    setId={group.setId}
                    setName={group.setName}
                    setSeries={group.setSeries}
                    setSymbol={group.setSymbol}
                    printedTotal={group.printedTotal}
                    cards={group.cards}
                    collection={collection}
                    onCard={(id) => navigate(`/card/${id}`)}
                    onFilter={(id) =>
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('set', id);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            ) : view === 'grid' ? (
              <VirtuosoGrid
                useWindowScroll
                data={filteredCards}
                listClassName="virtual-grid-list"
                itemClassName="virtual-grid-item"
                style={{
                  width: '100%',
                }}
                components={{
                  List: React.forwardRef((props: any, ref) => (
                    <div
                      {...props}
                      ref={ref}
                      style={{
                        padding: '0 18px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 12,
                        justifyItems: 'center',
                        ...props.style,
                      }}
                    />
                  )),
                  Item: ({ children, ...props }: any) => (
                    <div {...props} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                      {children}
                    </div>
                  )
                }}
                itemContent={(index, c) => (
                  <CardTile
                    key={c.id}
                    card={c}
                    meta={collection.cards[c.id]}
                    width={104}
                    onClick={() => navigate(`/card/${c.id}`)}
                    showMissingState={!onlyMine}
                  />
                )}
              />
            ) : (
              <div
                style={{
                  padding: '0 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {filteredCards.map((c) => (
                  <Surface
                    key={c.id}
                    onClick={() => navigate(`/card/${c.id}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 10,
                    }}
                  >
                    <TcgCardImage card={c} width={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          letterSpacing: -0.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.name}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 2,
                          flexWrap: 'wrap',
                        }}
                      >
                        <RarityBadge rarity={c.rarity} />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.number}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <PriceBadge price={getEstimatedPrice(c)} />
                      {collection.cards[c.id]?.quantity ? (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          ×{collection.cards[c.id]?.quantity}
                        </div>
                      ) : null}
                    </div>
                  </Surface>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Header                                                                     */
/* ------------------------------------------------------------------------- */

function Header({
  onSet,
  setName,
  onClear,
  searchOpen,
  setSearchOpen,
  searchQuery,
  setSearchQuery,
}: {
  onSet: boolean;
  setName: string;
  onClear: () => void;
  searchOpen: boolean;
  setSearchOpen: (val: boolean) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
}) {
  return (
    <div
      style={{
        padding: '54px 18px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 106,
        boxSizing: 'border-box',
      }}
    >
      {searchOpen ? (
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Buscar por nombre, número o set..."
              autoFocus
            />
          </div>
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 4px',
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 800,
              color: 'var(--ink)',
              letterSpacing: -0.6,
            }}
          >
            Mi Colección
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {onSet && (
              <button
                onClick={onClear}
                title={`Quitar filtro: ${setName}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 38,
                  padding: '0 12px',
                  borderRadius: 12,
                  background: 'var(--accent-tint)',
                  color: 'var(--accent)',
                  border: '0.5px solid var(--accent)',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Set <CloseIcon size={12} />
              </button>
            )}
            <button
              onClick={() => setSearchOpen(true)}
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
              aria-label="Buscar"
            >
              <SearchIcon size={18} />
            </button>
            <button
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
              aria-label="Filtrar"
            >
              <FilterIcon size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Rarity summary panel                                                       */
/* ------------------------------------------------------------------------- */

function RaritySummary({ counts }: { counts: Map<string, number> }) {
  // Top 5 by count.
  const entries = Array.from(counts.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (entries.length === 0) return null;

  return (
    <div style={{ padding: '0 14px 14px' }}>
      <div
        style={{
          background: 'var(--ink)',
          color: '#fff',
          borderRadius: 22,
          padding: '14px 16px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(1.5px 1.5px at 30% 60%, rgba(255,255,255,0.32), transparent), radial-gradient(1px 1px at 70% 20%, rgba(255,255,255,0.3), transparent), radial-gradient(1px 1px at 85% 80%, rgba(255,255,255,0.3), transparent)',
            opacity: 0.6,
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>
            Resumen de rarezas
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            {entries.reduce((a, [, v]) => a + v, 0)} cartas
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `repeat(${entries.length}, 1fr)`,
            gap: 6,
          }}
        >
          {entries.map(([label, n]) => (
            <div key={label} style={{ textAlign: 'left' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.65)',
                  letterSpacing: -0.1,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  marginTop: 2,
                  letterSpacing: -0.4,
                }}
              >
                {n}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Sets view subcomponents                                                    */
/* ------------------------------------------------------------------------- */

/**
 * One group card for the "Por expansión" view: header (symbol + name +
 * progress) and a row of owned cards followed by greyed placeholders for the
 * missing slots. The placeholders are intentionally subtle — they should feel
 * like the empty pockets of a binder page, not like clickable cards.
 *
 * We cap the number of placeholders rendered (`MAX_PLACEHOLDERS`) so a very
 * incomplete large set doesn't push 250 grey rectangles into the DOM.
 */
const MAX_PLACEHOLDERS = 24;

function SetGroupCard({
  setId,
  setName,
  setSeries,
  setSymbol,
  printedTotal,
  cards,
  collection,
  onCard,
  onFilter,
}: {
  setId: string;
  setName: string;
  setSeries: string;
  setSymbol: string | null;
  printedTotal: number;
  cards: PokemonCard[];
  collection: CollectionState;
  onCard: (id: string) => void;
  onFilter: (id: string) => void;
}) {
  const owned = cards.length;
  const ratio = printedTotal > 0 ? Math.min(1, owned / printedTotal) : 0;
  const missing = Math.max(0, printedTotal - owned);
  const placeholderCount = Math.min(missing, MAX_PLACEHOLDERS);
  const overflowCount = missing - placeholderCount;

  return (
    <Surface style={{ padding: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--bg)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '0.5px solid var(--border)',
            flexShrink: 0,
          }}
        >
          {setSymbol ? (
            <img
              src={setSymbol}
              alt=""
              style={{ width: 28, height: 28, objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <LayersIcon size={20} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: -0.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {setName}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {setSeries}
            {printedTotal > 0
              ? ` · ${owned}/${printedTotal} (${Math.round(ratio * 100)}%)`
              : ` · ${owned} cartas`}
          </div>
        </div>
        {setId !== 'unknown' && (
          <button
            onClick={() => onFilter(setId)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'var(--accent-tint)',
              padding: '5px 10px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Filtrar
          </button>
        )}
      </div>

      {/* Progress bar */}
      {printedTotal > 0 && (
        <div
          style={{
            height: 4,
            width: '100%',
            background: 'var(--bg)',
            borderRadius: 999,
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${ratio * 100}%`,
              background: 'var(--accent)',
              transition: 'width 280ms ease',
            }}
          />
        </div>
      )}

      {/* Owned + missing placeholders */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          justifyItems: 'center',
        }}
      >
        {cards.slice(0, 24).map((c) => (
          <CardTile
            key={c.id}
            card={c}
            meta={collection.cards[c.id]}
            width={76}
            onClick={() => onCard(c.id)}
          />
        ))}
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <MissingCardPlaceholder key={`missing-${setId}-${i}`} />
        ))}
      </div>

      {(cards.length > 24 || overflowCount > 0) && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: 'var(--muted)',
            textAlign: 'center',
          }}
        >
          {cards.length > 24 && `+${cards.length - 24} más en tu colección`}
          {cards.length > 24 && overflowCount > 0 && ' · '}
          {overflowCount > 0 && `+${overflowCount} huecos no mostrados`}
        </div>
      )}
    </Surface>
  );
}

/**
 * Subtle placeholder representing a missing card slot in a binder page.
 * Intentionally non-interactive — it's a visual cue, not a click target.
 */
function MissingCardPlaceholder() {
  return (
    <div
      aria-hidden
      style={{
        width: 76,
        height: 106,
        borderRadius: 8,
        border: '1px dashed var(--border)',
        background:
          'repeating-linear-gradient(135deg, var(--bg) 0 6px, var(--surface) 6px 12px)',
        opacity: 0.65,
      }}
    />
  );
}
