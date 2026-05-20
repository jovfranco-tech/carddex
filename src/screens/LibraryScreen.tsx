import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Surface from '@/components/Surface';
import Chip from '@/components/Chip';
import CardTile from '@/components/CardTile';
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
  BookIcon,
  BellIcon,
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
import {
  getPriceAlerts,
  markAllAlertsAsRead,
  clearAllPriceAlerts,
  subscribePriceAlerts,
  type PriceAlert
} from '@/lib/priceMonitor';
import { triggerHaptic } from '@/lib/haptic';
import type { PokemonCard } from '@/types/pokemon';
import VisualCollectionStats from '@/components/VisualCollectionStats';

type SortKey = 'rarity' | 'value' | 'name' | 'recent';

const SORT_LABELS: Record<SortKey, string> = {
  rarity: 'Rareza',
  value: 'Valor',
  name: 'Nombre',
  recent: 'Recientes',
};

interface AdvancedFilters {
  name?: string;
  types: string[];
  hpMin?: number;
  hpMax?: number;
  rarities: string[];
}

function mapTypeToEnglish(t: string): string {
  switch (t) {
    case 'fuego': return 'fire';
    case 'agua': return 'water';
    case 'planta': return 'grass';
    case 'rayo': case 'eléctrico': case 'electrico': return 'lightning';
    case 'psíquico': case 'psiquico': return 'psychic';
    case 'lucha': return 'fighting';
    case 'oscuridad': case 'siniestro': return 'darkness';
    case 'metal': case 'acero': return 'metal';
    case 'dragón': case 'dragon': return 'dragon';
    case 'incoloro': return 'colorless';
    case 'hada': return 'fairy';
    default: return t;
  }
}

function mapRarityToEnglish(r: string): string {
  switch (r) {
    case 'común': case 'comun': return 'common';
    case 'infrecuente': return 'uncommon';
    case 'rara': return 'rare';
    case 'secreta': case 'secreto': return 'secret';
    default: return r;
  }
}

function parseAdvancedQuery(query: string): AdvancedFilters {
  const parts = query.split(/\s+/);
  const filters: AdvancedFilters = {
    types: [],
    rarities: [],
  };

  const nameParts: string[] = [];

  parts.forEach((part) => {
    if (!part) return;

    if (part.startsWith('t:') || part.startsWith('tipo:') || part.startsWith('type:')) {
      const val = part.split(':')[1]?.toLowerCase();
      if (val) filters.types.push(val);
    } else if (part.startsWith('r:') || part.startsWith('rareza:') || part.startsWith('rarity:')) {
      const val = part.split(':')[1]?.toLowerCase();
      if (val) filters.rarities.push(val);
    } else if (part.startsWith('hp>')) {
      const val = parseInt(part.substring(3), 10);
      if (!isNaN(val)) filters.hpMin = val;
    } else if (part.startsWith('hp<')) {
      const val = parseInt(part.substring(3), 10);
      if (!isNaN(val)) filters.hpMax = val;
    } else if (part.startsWith('hp=')) {
      const val = parseInt(part.substring(3), 10);
      if (!isNaN(val)) {
        filters.hpMin = val;
        filters.hpMax = val;
      }
    } else {
      nameParts.push(part);
    }
  });

  if (nameParts.length > 0) {
    filters.name = nameParts.join(' ').toLowerCase();
  }

  return filters;
}

function matchesAdvancedFilters(c: PokemonCard, f: AdvancedFilters): boolean {
  if (f.name) {
    const nameMatch = c.name.toLowerCase().includes(f.name);
    const numMatch = c.number?.toLowerCase().includes(f.name);
    const setMatch = c.set?.name?.toLowerCase().includes(f.name) || c.set?.id?.toLowerCase().includes(f.name);
    if (!nameMatch && !numMatch && !setMatch) return false;
  }

  if (f.types.length > 0) {
    const cardTypes = (c.types || []).map((t) => t.toLowerCase());
    const supertype = c.supertype?.toLowerCase() || '';
    const subtype = (c.subtypes || []).map((s) => s.toLowerCase());

    const match = f.types.some((t) => {
      const englishType = mapTypeToEnglish(t);
      return (
        cardTypes.includes(englishType) ||
        cardTypes.includes(t) ||
        supertype.includes(t) ||
        subtype.includes(t)
      );
    });
    if (!match) return false;
  }

  if (f.rarities.length > 0) {
    const cardRarity = c.rarity?.toLowerCase() || '';
    const match = f.rarities.some((r) => {
      const englishRarity = mapRarityToEnglish(r);
      return cardRarity.includes(englishRarity) || cardRarity.includes(r);
    });
    if (!match) return false;
  }

  if (f.hpMin !== undefined || f.hpMax !== undefined) {
    const hpVal = parseInt(c.hp || '', 10);
    if (isNaN(hpVal)) return false;
    if (f.hpMin !== undefined && hpVal < f.hpMin) return false;
    if (f.hpMax !== undefined && hpVal > f.hpMax) return false;
  }

  return true;
}

const SEARCH_SUGGESTIONS = [
  { label: '🔥 Fuego', value: 'tipo:fuego' },
  { label: '💧 Agua', value: 'tipo:agua' },
  { label: '🌿 Planta', value: 'tipo:planta' },
  { label: '⚡ Rayo', value: 'tipo:rayo' },
  { label: '👁️ Psíquico', value: 'tipo:psiquico' },
  { label: '✊ Lucha', value: 'tipo:lucha' },
  { label: '⭐ Incoloro', value: 'tipo:incoloro' },
  { label: '❤️ HP > 120', value: 'hp>120' },
  { label: '❤️ HP > 200', value: 'hp>200' },
  { label: '✨ Raras', value: 'rareza:rare' },
  { label: '🌟 Secretas', value: 'rareza:secret' },
];

export default function LibraryScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const collection = useCollection();

  const [visibleCount, setVisibleCount] = useState(24);

  const setFilter = searchParams.get('set') ?? '';
  const [view, setView] = useState<'grid' | 'list' | 'sets' | 'binder'>('grid');
  const [binderPage, setBinderPage] = useState(1);
  
  // Parse initial states from URL query parameters
  const initialQ = useMemo(() => searchParams.get('q') ?? '', []);
  const initialMine = useMemo(() => {
    const p = searchParams.get('mine');
    return p === 'false' ? false : true;
  }, []);

  const [onlyMine, setOnlyMine] = useState(initialMine);
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('rarity');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [searchOpen, setSearchOpen] = useState(!!initialQ);
  const debouncedSearchQuery = useDebounced(searchQuery, 400);

  const [alerts, setAlerts] = useState<PriceAlert[]>(() => getPriceAlerts());
  const [alertsOpen, setAlertsOpen] = useState(false);

  React.useEffect(() => {
    return subscribePriceAlerts(() => {
      setAlerts(getPriceAlerts());
    });
  }, []);

  // Reset pagination when search query or filters change
  React.useEffect(() => {
    setVisibleCount(24);
    setBinderPage(1);
  }, [debouncedSearchQuery, setFilter, onlyMine, rarityFilter]);

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
        { setId: setFilter, pageSize: 250, orderBy: 'number' },
        { signal },
      );
      return data;
    } else {
      const { data } = await searchCards(
        { name: debouncedSearchQuery.trim(), pageSize: 250, orderBy: '-set.releaseDate' },
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
      const parsed = parseAdvancedQuery(searchQuery);
      list = list.filter((c) => matchesAdvancedFilters(c, parsed));
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

  const totalBinderPages = Math.max(1, Math.ceil(filteredCards.length / 9));

  const binderCards = useMemo(() => {
    const start = (binderPage - 1) * 9;
    return filteredCards.slice(start, start + 9);
  }, [filteredCards, binderPage]);

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
          unreadAlertsCount={alerts.filter(a => !a.read).length}
          onAlertsOpen={() => {
            setAlertsOpen(true);
            triggerHaptic('light');
          }}
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
          unreadAlertsCount={alerts.filter(a => !a.read).length}
          onAlertsOpen={() => {
            setAlertsOpen(true);
            triggerHaptic('light');
          }}
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
        unreadAlertsCount={alerts.filter(a => !a.read).length}
        onAlertsOpen={() => {
          setAlertsOpen(true);
          triggerHaptic('light');
        }}
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
                    ['binder', <BookIcon size={16} />, 'Vista carpeta'],
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

          {/* Collection statistics panel */}
          {owned.data && owned.data.length > 0 && (
            <VisualCollectionStats ownedCards={owned.data} collection={collection} />
          )}

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div
                  style={{
                    padding: '0 18px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                    justifyItems: 'center',
                  }}
                >
                  {filteredCards.slice(0, visibleCount).map((c) => (
                    <CardTile
                      key={c.id}
                      card={c}
                      meta={collection.cards[c.id]}
                      width={104}
                      onClick={() => navigate(`/card/${c.id}`)}
                      showMissingState={!onlyMine}
                    />
                  ))}
                </div>

                {filteredCards.length > visibleCount && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 18px' }}>
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 24)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--ink)',
                        borderRadius: 16,
                        border: '1px solid var(--border)',
                        padding: '14px 28px',
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
                        transition: 'all 200ms ease',
                        width: '100%',
                        maxWidth: 260,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      Cargar más ({filteredCards.length - visibleCount} restantes)
                    </button>
                  </div>
                )}
              </div>
            ) : view === 'binder' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
                {/* Visual Binder Sheet */}
                <div className="binder-sheet">
                  {/* Left ring binder margin with punch holes */}
                  <div className="binder-spine">
                    <div className="punch-hole" />
                    <div className="punch-hole" />
                    <div className="punch-hole" />
                    <div className="punch-hole" />
                  </div>
                  
                  {/* 3x3 Grid of Pockets */}
                  <div className="binder-grid">
                    {Array.from({ length: 9 }).map((_, index) => {
                      const card = binderCards[index];
                      if (card) {
                        return (
                          <div key={card.id} className="binder-pocket">
                            <CardTile
                              card={card}
                              meta={collection.cards[card.id]}
                              width={92}
                              onClick={() => navigate(`/card/${card.id}`)}
                              showMissingState={!onlyMine}
                            />
                            <div className="pocket-reflection" />
                          </div>
                        );
                      } else {
                        // Empty sleeve pocket
                        return (
                          <div key={`empty-${index}`} className="binder-pocket empty-pocket">
                            <div className="empty-pocket-inner">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.25 }}>
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <line x1="9" y1="3" x2="9" y2="21" />
                                <line x1="15" y1="3" x2="15" y2="21" />
                                <line x1="3" y1="9" x2="21" y2="9" />
                                <line x1="3" y1="15" x2="21" y2="15" />
                              </svg>
                            </div>
                            <div className="pocket-reflection" />
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>

                {/* Floating controls for binder pages */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '8px 16px',
                  borderRadius: 99,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  marginTop: 6,
                }}>
                  <button
                    disabled={binderPage === 1}
                    onClick={() => setBinderPage(p => Math.max(1, p - 1))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: binderPage === 1 ? 'var(--muted-3)' : 'var(--ink)',
                      cursor: binderPage === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 4,
                      opacity: binderPage === 1 ? 0.4 : 1,
                    }}
                    aria-label="Página anterior"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', minWidth: 100, textAlign: 'center' }}>
                    Pág. {binderPage} de {totalBinderPages}
                  </span>

                  <button
                    disabled={binderPage === totalBinderPages}
                    onClick={() => setBinderPage(p => Math.min(totalBinderPages, p + 1))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: binderPage === totalBinderPages ? 'var(--muted-3)' : 'var(--ink)',
                      cursor: binderPage === totalBinderPages ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 4,
                      opacity: binderPage === totalBinderPages ? 0.4 : 1,
                    }}
                    aria-label="Página siguiente"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div
                  style={{
                    padding: '0 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {filteredCards.slice(0, visibleCount).map((c) => (
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

                {filteredCards.length > visibleCount && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 14px' }}>
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 24)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--ink)',
                        borderRadius: 16,
                        border: '1px solid var(--border)',
                        padding: '14px 28px',
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
                        transition: 'all 200ms ease',
                        width: '100%',
                        maxWidth: 260,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      Cargar más ({filteredCards.length - visibleCount} restantes)
                    </button>
                  </div>
                )}
              </div>
            )}
          </Section>
        </>
      )}

      {/* Price Alerts Glassmorphic Side/Bottom Panel */}
      {alertsOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(15, 20, 40, 0.4)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => {
            setAlertsOpen(false);
            triggerHaptic('light');
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(20px) saturate(180%)',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: '24px 20px 40px',
              boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.15)',
              border: '0.5px solid rgba(255, 255, 255, 0.4)',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grabber */}
            <div
              style={{
                width: 36,
                height: 5,
                background: 'rgba(0, 0, 0, 0.1)',
                borderRadius: 2.5,
                alignSelf: 'center',
                marginBottom: 18,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
                Alertas de Precios
              </h2>
              <div style={{ display: 'flex', gap: 10 }}>
                {alerts.length > 0 && (
                  <button
                    onClick={() => {
                      markAllAlertsAsRead();
                      triggerHaptic('light');
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Marcar leídas
                  </button>
                )}
                <button
                  onClick={() => {
                    setAlertsOpen(false);
                    triggerHaptic('light');
                  }}
                  style={{
                    background: 'rgba(0, 0, 0, 0.05)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontWeight: 700,
                    color: 'var(--ink-2)',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* List */}
            <div
              className="no-scrollbar"
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                paddingRight: 2,
              }}
            >
              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13 }}>
                  No tienes alertas de precios en este momento.
                </div>
              ) : (
                alerts.map((alert) => {
                  const isUp = alert.changePercent >= 0;
                  return (
                    <div
                      key={alert.id}
                      onClick={() => {
                        setAlertsOpen(false);
                        triggerHaptic('light');
                        navigate(`/card/${alert.cardId}`);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 16,
                        background: alert.read ? 'rgba(0, 0, 0, 0.02)' : 'rgba(123, 90, 217, 0.06)',
                        border: alert.read ? '0.5px solid rgba(0, 0, 0, 0.05)' : '0.5px solid rgba(123, 90, 217, 0.2)',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        boxShadow: alert.read ? 'none' : '0 4px 12px rgba(123, 90, 217, 0.04)',
                      }}
                    >
                      <img
                        src={alert.cardImage}
                        alt={alert.cardName}
                        style={{
                          width: 38,
                          height: 53,
                          borderRadius: 6,
                          objectFit: 'cover',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {alert.cardName}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: isUp ? 'var(--success)' : 'var(--error)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isUp ? '▲' : '▼'} {Math.abs(alert.changePercent)}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Antes: <span style={{ textDecoration: 'line-through' }}>${alert.oldPrice.toFixed(2)}</span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                            Ahora: ${alert.newPrice.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(alert.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {alerts.length > 0 && (
              <button
                onClick={() => {
                  clearAllPriceAlerts();
                  triggerHaptic('heavy');
                }}
                style={{
                  width: '100%',
                  marginTop: 20,
                  background: 'rgba(255, 59, 48, 0.08)',
                  color: '#FF3B30',
                  border: 'none',
                  borderRadius: 14,
                  padding: '12px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s',
                }}
              >
                Limpiar todas las alertas
              </button>
            )}
          </div>
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
      <style>{`
        .binder-sheet {
          position: relative;
          width: calc(100% - 28px);
          max-width: 370px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03);
          display: flex;
          padding: 16px 12px 16px 28px;
          overflow: hidden;
          background-image: radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 0);
          background-size: 24px 24px;
        }
        .binder-spine {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 24px;
          background: rgba(0, 0, 0, 0.15);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          justify-content: space-around;
          align-items: center;
          padding: 30px 0;
        }
        .punch-hole {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #0f1116;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.8), 0 0 0 1px rgba(255, 255, 255, 0.08);
          position: relative;
        }
        .punch-hole::after {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.05);
          pointer-events: none;
        }
        .binder-grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          justify-items: center;
        }
        .binder-pocket {
          position: relative;
          aspect-ratio: 92/128;
          width: 100%;
          max-width: 96px;
          border-radius: 8px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.2);
          box-shadow: inset 0 0 8px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .binder-pocket:hover {
          transform: translateY(-4px) scale(1.03);
          z-index: 10;
        }
        .empty-pocket {
          border: 1px dashed rgba(255, 255, 255, 0.08);
          background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.01) 0 6px, transparent 6px 12px);
        }
        .empty-pocket-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.15);
        }
        .pocket-reflection {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.02) 100%);
          border-radius: 8px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
          z-index: 5;
        }
      `}</style>
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
  unreadAlertsCount = 0,
  onAlertsOpen,
}: {
  onSet: boolean;
  setName: string;
  onClear: () => void;
  searchOpen: boolean;
  setSearchOpen: (val: boolean) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  unreadAlertsCount?: number;
  onAlertsOpen?: () => void;
}) {
  return (
    <div
      style={{
        padding: '54px 18px 14px',
        display: 'flex',
        alignItems: 'stretch',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: 106,
        height: searchOpen ? 'auto' : 106,
        boxSizing: 'border-box',
        gap: 12,
      }}
    >
      {searchOpen ? (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 10 }}>
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Ej: charizard tipo:fuego hp>120"
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
          {/* Advanced Search Suggestions Row */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '4px 0 8px',
              width: '100%',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
          >
            {SEARCH_SUGGESTIONS.map((s) => {
              const active = searchQuery.includes(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => {
                    setSearchQuery(
                      searchQuery.trim().includes(s.value)
                        ? searchQuery.replace(s.value, '').replace(/\s+/g, ' ').trim()
                        : `${searchQuery.trim()} ${s.value}`.trim()
                    );
                  }}
                  style={{
                    flexShrink: 0,
                    padding: '6px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1.5px solid',
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent-tint)' : 'var(--surface-overlay)',
                    color: active ? 'var(--accent)' : 'var(--ink)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
              onClick={onAlertsOpen}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'var(--surface)',
                border: '0.5px solid var(--border)',
                color: unreadAlertsCount > 0 ? 'var(--accent)' : 'var(--ink-2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
              }}
              aria-label="Alertas de precios"
            >
              <BellIcon size={18} />
              {unreadAlertsCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 900,
                    borderRadius: '50%',
                    width: 15,
                    height: 15,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1.5px solid var(--bg)',
                  }}
                >
                  {unreadAlertsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
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
