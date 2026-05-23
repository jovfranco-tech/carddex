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
import { recognizeCardFromImage } from '@/lib/cardRecognition';
import { RARITY_FILTERS, rarityMatchesFilter, raritySortWeight, rarityLabel } from '@/lib/rarity';
import { formatInt } from '@/lib/formatters';
import type { CollectionState } from '@/types/collection';
import {
  getPriceAlerts,
  markAllAlertsAsRead,
  clearAllPriceAlerts,
  subscribePriceAlerts,
  detectRealPriceChanges,
  type PriceAlert,
} from '@/lib/priceMonitor';
import { triggerHaptic } from '@/lib/haptic';
import type { PokemonCard } from '@/types/pokemon';
const VisualCollectionStats = React.lazy(() => import('@/components/VisualCollectionStats'));
import { logCollectionValueSnapshot } from '@/lib/collectionStorage';

import {
  type SortKey,
  SORT_LABELS,
  type AdvancedFilters,
  parseAdvancedQuery,
  matchesAdvancedFilters,
  SEARCH_SUGGESTIONS,
  base64ToFile,
} from './library/libraryHelpers';
import LibraryFiltersBar from './library/LibraryFiltersBar';
import PriceAlertsPanel from './library/PriceAlertsPanel';
import CardListView from './library/CardListView';

export default function LibraryScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const collection = useCollection();

  const [imageRecognizing, setImageRecognizing] = useState(false);
  const [recognizingImageBase64, setRecognizingImageBase64] = useState<string | null>(null);

  const handleImageSearch = async (base64Image: string) => {
    setImageRecognizing(true);
    setRecognizingImageBase64(base64Image);
    triggerHaptic('medium');

    try {
      const resFile = base64ToFile(base64Image, 'search-card.jpg');
      const result = await recognizeCardFromImage({ type: 'file', file: resFile });

      if (result && result.cardName) {
        setSearchQuery(result.cardName);
        setSearchOpen(true);
        triggerHaptic('success');
      } else {
        triggerHaptic('warning');
        alert('No se pudo identificar la carta con claridad. Intenta con otra foto.');
      }
    } catch (err) {
      console.error('Error during image search:', err);
      triggerHaptic('error');
    } finally {
      setImageRecognizing(false);
      setRecognizingImageBase64(null);
    }
  };

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
  const initialAi = useMemo(() => searchParams.get('ai') === 'true', []);

  const [onlyMine, setOnlyMine] = useState(initialMine);
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('rarity');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [searchOpen, setSearchOpen] = useState(!!initialQ);
  const debouncedSearchQuery = useDebounced(searchQuery, 400);

  const [isAiSearch, setIsAiSearch] = useState(initialAi);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [translatedQuery, setTranslatedQuery] = useState(initialQ);

  React.useEffect(() => {
    if (!isAiSearch) {
      setTranslatedQuery(debouncedSearchQuery);
      setAiExplanation(null);
      return;
    }

    if (!debouncedSearchQuery.trim()) {
      setTranslatedQuery('');
      setAiExplanation(null);
      return;
    }

    let active = true;
    const runTranslation = async () => {
      setAiLoading(true);
      try {
        const res = await fetch('/api/semantic-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: debouncedSearchQuery.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setTranslatedQuery(data.luceneQuery || debouncedSearchQuery);
            setAiExplanation(data.explanation);
          }
        } else {
          if (active) {
            setTranslatedQuery(debouncedSearchQuery);
            setAiExplanation(null);
          }
        }
      } catch (e) {
        console.info('[Search Assist] Server semantic search unavailable, using plain search.', e);
        if (active) {
          setTranslatedQuery(debouncedSearchQuery);
          setAiExplanation(null);
        }
      } finally {
        if (active) setAiLoading(false);
      }
    };

    runTranslation();
    return () => {
      active = false;
    };
  }, [debouncedSearchQuery, isAiSearch]);

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
    [collection]
  );

  const owned = useAsync(
    (signal) =>
      collectionIds.length ? getCardsByIds(collectionIds, { signal }) : Promise.resolve([]),
    [collectionIds.join(',')]
  );

  React.useEffect(() => {
    if (owned.data && owned.data.length > 0) {
      logCollectionValueSnapshot(owned.data);
      // Detect real price changes vs. stored baselines (throttled to 3h internally).
      detectRealPriceChanges(owned.data).catch(console.error);
    }
  }, [owned.data]);

  // When viewing "all" + a set filter (or global search query), fetch the cards from the API.
  const setView$ = useAsync(
    async (signal) => {
      if (onlyMine) return [];

      // Promo filter: show ONLY local offline-catalog + custom cards (no API mix-in)
      if (rarityFilter === 'promo' && !setFilter) {
        const { data } = await searchCards(
          { name: translatedQuery.trim() || '', pageSize: 250, localOnly: true },
          { signal }
        );
        return data;
      }

      if (!setFilter && !translatedQuery.trim()) return [];

      if (setFilter) {
        const { data } = await searchCards(
          { setId: setFilter, pageSize: 250, orderBy: 'number' },
          { signal }
        );
        return data;
      } else {
        const { data } = await searchCards(
          { name: translatedQuery.trim(), pageSize: 250, orderBy: '-set.releaseDate' },
          { signal }
        );
        return data;
      }
    },
    [onlyMine, setFilter, translatedQuery, rarityFilter]
  );

  const baseCards = onlyMine
    ? (owned.data ?? [])
    : ((setFilter || translatedQuery.trim() || rarityFilter === 'promo' ? setView$.data : null) ??
      owned.data ??
      []);

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
        0
      ),
    [filteredCards, collection, onlyMine]
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
      const g = map.get(setId) ?? {
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
          unreadAlertsCount={alerts.filter((a) => !a.read).length}
          onAlertsOpen={() => {
            setAlertsOpen(true);
            triggerHaptic('light');
          }}
          isAiSearch={isAiSearch}
          setIsAiSearch={setIsAiSearch}
          aiExplanation={aiExplanation}
          aiLoading={aiLoading}
          onImageSearch={handleImageSearch}
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
          unreadAlertsCount={alerts.filter((a) => !a.read).length}
          onAlertsOpen={() => {
            setAlertsOpen(true);
            triggerHaptic('light');
          }}
          isAiSearch={isAiSearch}
          setIsAiSearch={setIsAiSearch}
          aiExplanation={aiExplanation}
          aiLoading={aiLoading}
          onImageSearch={handleImageSearch}
        />
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  const showEmpty = collectionIds.length === 0 && onlyMine && !setFilter && !searchQuery.trim();

  /* --------------------------------------------------------------------- */

  return (
    <div style={{ paddingBottom: 110 }}>
      {/* Scanning hologram overlay */}
      {imageRecognizing && recognizingImageBase64 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 24,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 280,
              aspectRatio: '3 / 4.2',
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              border: '1.5px solid rgba(255,255,255,0.15)',
              background: '#1A1B23',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={recognizingImageBase64}
              alt="Scanning..."
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.85,
              }}
            />
            {/* Holographic Laser overlay */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 4,
                background:
                  'linear-gradient(90deg, rgba(123, 90, 217, 0), rgba(123, 90, 217, 1) 50%, rgba(123, 90, 217, 0))',
                boxShadow: '0 0 15px 3px rgba(123, 90, 217, 0.8)',
                animation: 'laserScanAnim 2s ease-in-out infinite',
              }}
            />

            {/* Grid overlay for scanning effect */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                pointerEvents: 'none',
              }}
            />
          </div>

          <h3
            style={{
              margin: '24px 0 8px',
              fontSize: 18,
              fontWeight: 800,
              color: '#fff',
              letterSpacing: -0.4,
            }}
          >
            Identificando carta...
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'rgba(255,255,255,0.6)',
              textAlign: 'center',
              maxWidth: 260,
              lineHeight: 1.5,
            }}
          >
            CardDex está generando una sugerencia asistida. Confirma el resultado antes de guardar.
          </p>

          <style>{`
            @keyframes laserScanAnim {
              0% { top: 0%; }
              50% { top: 100%; }
              100% { top: 0%; }
            }
          `}</style>
        </div>
      )}

      <Header
        onSet={!!setFilter}
        setName={setFilter}
        onClear={() => setSearchParams({})}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        unreadAlertsCount={alerts.filter((a) => !a.read).length}
        onAlertsOpen={() => {
          setAlertsOpen(true);
          triggerHaptic('light');
        }}
        isAiSearch={isAiSearch}
        setIsAiSearch={setIsAiSearch}
        aiExplanation={aiExplanation}
        aiLoading={aiLoading}
        onImageSearch={handleImageSearch}
      />

      {showEmpty ? (
        <EmptyState
          icon={<LayersIcon size={42} />}
          title="Aún no tienes cartas"
          description="Cuando guardes cartas, aparecerán aquí ordenadas por rareza."
        />
      ) : (
        <>
          <LibraryFiltersBar
            rarityFilter={rarityFilter}
            setRarityFilter={setRarityFilter}
            onlyMine={onlyMine}
            setOnlyMine={setOnlyMine}
            totalQuantity={totalQuantity}
            sort={sort}
            setSort={setSort}
            view={view}
            setView={setView}
          />

          {/* Collection statistics panel */}
          {owned.data && owned.data.length > 0 && (
            <React.Suspense
              fallback={
                <div
                  style={{
                    minHeight: 80,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: 'var(--muted)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Cargando análisis visual...
                </div>
              }
            >
              <VisualCollectionStats ownedCards={owned.data} collection={collection} />
            </React.Suspense>
          )}

          {/* Rarest */}
          {rarest.length > 0 && (
            <Section title="Mis cartas más raras" action={<ActionLink>Ver todas</ActionLink>}>
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
            <CardListView
              view={view}
              filteredCards={filteredCards}
              collection={collection}
              onlyMine={onlyMine}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 24)}
              binderPage={binderPage}
              totalBinderPages={totalBinderPages}
              binderCards={binderCards}
              onBinderPrev={() => setBinderPage((p) => Math.max(1, p - 1))}
              onBinderNext={() => setBinderPage((p) => Math.min(totalBinderPages, p + 1))}
              bySetGroups={bySetGroups}
              onSetFilter={(id) =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('set', id);
                  return next;
                })
              }
            />
          </Section>
        </>
      )}

      <PriceAlertsPanel
        isOpen={alertsOpen}
        alerts={alerts}
        onClose={() => setAlertsOpen(false)}
        onNavigate={navigate}
      />
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
  isAiSearch = false,
  setIsAiSearch = () => {},
  aiExplanation = null,
  aiLoading = false,
  onImageSearch,
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
  isAiSearch?: boolean;
  setIsAiSearch?: (val: boolean) => void;
  aiExplanation?: string | null;
  aiLoading?: boolean;
  onImageSearch?: (base64Image: string) => void;
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
                onImageSearch={onImageSearch}
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 2px',
            }}
          >
            <button
              type="button"
              onClick={() => setIsAiSearch(!isAiSearch)}
              style={{
                background: isAiSearch ? 'var(--accent-tint)' : 'rgba(255,255,255,0.04)',
                border: isAiSearch ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 12,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: isAiSearch ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 200ms ease',
              }}
            >
              <span>✦ Búsqueda asistida</span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isAiSearch ? 'var(--accent)' : 'var(--muted-3)',
                  display: 'inline-block',
                }}
              />
            </button>

            {aiLoading && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: '1.5px solid var(--border)',
                    borderTopColor: 'var(--accent)',
                    animation: 'spinSearchLoader 0.6s linear infinite',
                  }}
                />
                Traduciendo...
              </span>
            )}
          </div>

          {aiExplanation && (
            <div
              style={{
                background: 'var(--accent-tint)',
                color: 'var(--accent)',
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 10,
                fontWeight: 600,
                border: '0.5px solid rgba(123,90,217,0.2)',
                marginTop: -2,
              }}
            >
              Filtros aplicados: {aiExplanation}
            </div>
          )}

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
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
        background: 'repeating-linear-gradient(135deg, var(--bg) 0 6px, var(--surface) 6px 12px)',
        opacity: 0.65,
      }}
    />
  );
}
