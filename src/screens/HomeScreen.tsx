import { useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { triggerHaptic } from '@/lib/haptic';
import Surface from '@/components/Surface';
import Chip from '@/components/Chip';
import SearchBar from '@/components/SearchBar';
import StatCard from '@/components/StatCard';
import CardTile from '@/components/CardTile';
import RarityBadge from '@/components/RarityBadge';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Section, ActionLink } from '@/components/Section';
import {
  BellIcon,
  ChevronIcon,
  SortIcon,
  BookIcon,
  ScanIcon,
  SearchIcon,
} from '@/components/icons';
import {
  useAsync,
  useCollection,
  useCollectionSummary,
  useDebounced,
  useViewTransitionNavigate,
} from '@/lib/hooks';
import { getCardsByIds, searchCards } from '@/lib/pokemonTcgApi';
import {
  getEstimatedPrice,
  sumCollectionValue,
  formatCollectionValue,
  formatPrice,
} from '@/lib/pricing';
import { RARITY_FILTERS, rarityMatchesFilter, raritySortWeight, rarityLabel } from '@/lib/rarity';
import { formatInt } from '@/lib/formatters';
import type { PokemonCard } from '@/types/pokemon';
import AISynergyFeed from '@/components/AISynergyFeed';
import { useI18n } from '@/lib/i18n';

export default function HomeScreen() {
  const { t } = useI18n();
  const navigate = useViewTransitionNavigate();
  const collection = useCollection();
  const summary = useCollectionSummary();
  const [query, setQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState('all');
  const debouncedQuery = useDebounced(query, 320);

  const collectionIds = useMemo(
    () =>
      Object.values(collection.cards)
        .filter((c) => c.owned)
        .map((c) => c.cardId),
    [collection]
  );

  // Fetch owned card data so we can compute estimated value & featured set.
  const owned = useAsync(
    (signal) => getCardsByIds(collectionIds.slice(0, 60), { signal }),
    [collectionIds.join(',')]
  );

  // Pull-to-refresh state
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const PULL_THRESHOLD = 60;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop > 0) return; // Only trigger when at the top
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullY(Math.min(delta * 0.4, PULL_THRESHOLD)); // Rubber-band dampening
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pullY >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      setTimeout(() => {
        owned.reload();
        localStorage.removeItem('carddex.cachedSynergies'); // Bust synergy cache
        setIsRefreshing(false);
        setPullY(0);
      }, 900);
    } else {
      setPullY(0);
    }
  }, [pullY, owned]);

  // Search results — only if the user types something.
  const trimmed = debouncedQuery.trim();
  const search = useAsync(
    async (signal) => {
      if (!trimmed) return [];
      const { data } = await searchCards(
        {
          name: trimmed,
          pageSize: 18,
          orderBy: '-set.releaseDate',
        },
        { signal }
      );
      return data;
    },
    [trimmed]
  );

  /* --------------------------------------------------------------------- */
  /* Derived data                                                           */
  /* --------------------------------------------------------------------- */

  const totalValue = useMemo(() => {
    if (!owned.data) return null;
    const list = owned.data
      .filter((c) => collection.cards[c.id]?.owned)
      .map((c) => ({ card: c, quantity: collection.cards[c.id]?.quantity ?? 1 }));
    return sumCollectionValue(list);
  }, [owned.data, collection]);

  const featured = useMemo(() => {
    if (!owned.data) return [];
    return [...owned.data]
      .filter((c) => raritySortWeight(c.rarity) >= 60)
      .sort((a, b) => {
        const av = getEstimatedPrice(a)?.value ?? 0;
        const bv = getEstimatedPrice(b)?.value ?? 0;
        if (bv !== av) return bv - av;
        return raritySortWeight(b.rarity) - raritySortWeight(a.rarity);
      })
      .slice(0, 8);
  }, [owned.data]);

  const ownedCardNames = useMemo(() => {
    if (!owned.data) return [];
    return owned.data.filter((c) => collection.cards[c.id]?.owned).map((c) => c.name);
  }, [owned.data, collection]);

  /**
   * Lightweight collection insights. We compute the rarest owned card,
   * the most valuable one, the most-progressed expansion, and the duplicate
   * count. Always defensive — fall back to nulls when data is missing.
   */
  const insights = useMemo(() => {
    if (!owned.data || owned.data.length === 0) return null;
    const ownedCards = owned.data.filter((c) => collection.cards[c.id]?.owned);
    if (ownedCards.length === 0) return null;

    const rarest = [...ownedCards].sort(
      (a, b) => raritySortWeight(b.rarity) - raritySortWeight(a.rarity)
    )[0];

    let mostValuable: PokemonCard | null = null;
    let bestValue = 0;
    for (const c of ownedCards) {
      const p = getEstimatedPrice(c);
      if (p && p.value > bestValue) {
        bestValue = p.value;
        mostValuable = c;
      }
    }

    // Most-progressed set by owned count relative to printedTotal.
    const setCounts = new Map<string, { name: string; owned: number; total: number }>();
    for (const c of ownedCards) {
      if (!c.set?.id) continue;
      const cur = setCounts.get(c.set.id) ?? {
        name: c.set.name,
        owned: 0,
        total: c.set.printedTotal ?? c.set.total ?? 0,
      };
      cur.owned += 1;
      setCounts.set(c.set.id, cur);
    }
    const bestSet = Array.from(setCounts.values())
      .filter((s) => s.total > 0)
      .sort((a, b) => b.owned / b.total - a.owned / a.total)[0];

    const duplicates = Object.values(collection.cards).filter(
      (m) => m.owned && m.quantity > 1
    ).length;

    return { rarest, mostValuable, bestSet, duplicates };
  }, [owned.data, collection.cards]);

  const searchFiltered = useMemo(() => {
    if (!search.data) return [];
    return search.data.filter((c) => rarityMatchesFilter(c.rarity, rarityFilter));
  }, [search.data, rarityFilter]);

  const sparklineData = useMemo(() => {
    const currentValue = totalValue ? totalValue.usd || totalValue.eur || 120 : 120;
    let rawPoints: { date: string; value: number }[] = [];

    if (collection.history && collection.history.length >= 2) {
      rawPoints = collection.history;
    } else {
      // Generate retroactive seed data (30 points)
      let seed = currentValue;
      const lcg = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const seedPoints: { date: string; value: number }[] = [];
      let tempVal = currentValue * 0.85; // start lower
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const dateStr = d.toISOString().split('T')[0];

        if (i === 29) {
          seedPoints.push({ date: dateStr, value: currentValue });
        } else {
          seedPoints.push({ date: dateStr, value: Math.round(tempVal * 100) / 100 });
          const change = 1 + (lcg() * 0.04 - 0.018); // slight daily fluctuate
          tempVal = tempVal * change;
        }
      }
      rawPoints = seedPoints;
    }

    // Calculate performance change
    const first = rawPoints[0]?.value ?? 0;
    const last = rawPoints[rawPoints.length - 1]?.value ?? 0;
    const isPositive = last >= first;
    const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;

    return {
      points: rawPoints,
      isPositive,
      pctChange,
    };
  }, [totalValue, collection.history]);

  /* --------------------------------------------------------------------- */
  /* Empty state — no collection AND no active search                       */
  /* --------------------------------------------------------------------- */

  const isEmpty = collectionIds.length === 0 && !trimmed;

  /* --------------------------------------------------------------------- */
  /* Render                                                                 */
  /* --------------------------------------------------------------------- */

  return (
    <div
      style={{ paddingBottom: 'var(--bottom-nav-clearance)', overflowY: 'auto', height: '100%' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullY > 0 || isRefreshing) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: isRefreshing ? 48 : pullY,
            overflow: 'hidden',
            transition: isRefreshing ? 'none' : 'height 120ms ease',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '2.5px solid rgba(123,90,217,0.2)',
              borderTopColor: 'var(--accent)',
              animation: isRefreshing ? 'homePullSpin 0.7s linear infinite' : 'none',
              transform: isRefreshing ? undefined : `rotate(${(pullY / PULL_THRESHOLD) * 360}deg)`,
            }}
          />
        </div>
      )}
      <style>{`@keyframes homePullSpin { to { transform: rotate(360deg); } }`}</style>

      {/* Top Logo */}
      <div style={{ paddingTop: 54, display: 'flex', justifyContent: 'center' }}>
        <img
          src="/logo.svg"
          alt="Pokémon Trading Card Game"
          style={{
            height: 68,
            maxWidth: '80%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.18))',
          }}
        />
      </div>

      {/* Header */}
      <header
        style={{
          padding: '16px 18px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1
            style={{
              margin: '2px 0 0',
              fontSize: 30,
              fontWeight: 800,
              color: 'var(--ink)',
              letterSpacing: -0.8,
            }}
          >
            Mi Colección
          </h1>
        </div>
        <button
          aria-label="Notificaciones"
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            background: 'var(--surface)',
            border: '0.5px solid var(--border)',
            boxShadow: '0 1px 3px rgba(15,20,40,0.05)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-2)',
            position: 'relative',
          }}
        >
          <BellIcon size={20} />
          {(summary.wishlistCount > 0 || summary.missingCount > 0) && (
            <span
              style={{
                position: 'absolute',
                top: 9,
                right: 10,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--error)',
                border: '1.5px solid #fff',
              }}
            />
          )}
        </button>
      </header>

      {/* Search */}
      <div style={{ padding: '0 18px 16px' }}>
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {/* Empty path */}
      {isEmpty ? (
        <HomeEmpty
          onScan={() => navigate('/scan')}
          onSearch={() => {
            const input = document.querySelector<HTMLInputElement>(
              'input[aria-label="Buscar cartas"], input[type="search"]'
            );
            input?.focus();
          }}
        />
      ) : (
        <>
          {/* Portfolio Dashboard */}
          <button
            type="button"
            aria-label="Abrir biblioteca de colección"
            onClick={() => navigate('/library')}
            style={{
              display: 'block',
              width: 'calc(100% - 36px)',
              margin: '0 18px 16px',
              background: 'linear-gradient(135deg, rgba(24, 28, 48, 0.85), rgba(12, 14, 26, 0.95))',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 24,
              padding: '20px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
              overflow: 'hidden',
              position: 'relative',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            {/* Header info */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 6,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.45)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                  }}
                >
                  Valor del Portafolio
                </span>
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: '#FFF',
                    letterSpacing: -0.5,
                    marginTop: 4,
                  }}
                >
                  {totalValue ? formatCollectionValue(totalValue) : '—'}
                </span>
              </div>

              {/* Performance Pill Badge */}
              <div
                style={{
                  background: sparklineData.isPositive
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(239, 68, 68, 0.12)',
                  border: `0.5px solid ${sparklineData.isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                  color: sparklineData.isPositive ? '#10B981' : '#EF4444',
                  padding: '4px 10px',
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>{sparklineData.isPositive ? '▲' : '▼'}</span>
                <span>
                  {sparklineData.pctChange >= 0 ? '+' : ''}
                  {sparklineData.pctChange.toFixed(1)}%
                </span>
                <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 500 }}>30d</span>
              </div>
            </div>

            {/* Sparkline Area Chart */}
            <div style={{ width: '100%', height: 50, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={sparklineData.points}
                  margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="sparklineColorGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={sparklineData.isPositive ? '#10B981' : '#EF4444'}
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="95%"
                        stopColor={sparklineData.isPositive ? '#10B981' : '#EF4444'}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={sparklineData.isPositive ? '#10B981' : '#EF4444'}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#sparklineColorGrad)"
                    style={{
                      filter: `drop-shadow(0 2px 6px ${sparklineData.isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'})`,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </button>

          {/* Stats grid */}
          <div
            style={{
              padding: '0 18px',
              display: 'grid',
              gap: 10,
              gridTemplateColumns: '1fr 1fr 1fr',
              marginBottom: 22,
            }}
          >
            <StatCard
              label={t('home.totalCards')}
              value={formatInt(summary.totalQuantity)}
              accent="#2F80ED"
              glyph={<BookIcon size={16} />}
            />
            <StatCard
              label={t('home.uniqueCount')}
              value={formatInt(summary.uniqueCount)}
              accent="#27AE60"
              glyph="⬇"
            />
            <StatCard
              label={t('home.completed') || 'Completado'}
              value={
                insights?.bestSet
                  ? `${((insights.bestSet.owned / insights.bestSet.total) * 100).toFixed(1)}%`
                  : '0.0%'
              }
              suffix={t('home.completedSuffix') || 'de la colección'}
              accent="#9b51e0"
              glyph="↺"
            />
          </div>

          {/* Active search results */}
          {trimmed ? (
            <Section
              title={t('home.searchResults', { query: trimmed }) || `Resultados para “${trimmed}”`}
            >
              {/* Rarity chips */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  padding: '0 18px 12px',
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

              {search.loading ? (
                <LoadingState variant="grid" count={6} />
              ) : search.error ? (
                <ErrorState message={search.error} onRetry={search.reload} />
              ) : searchFiltered.length === 0 ? (
                <EmptyState
                  title={t('home.noResults') || 'Sin resultados'}
                  description={
                    t('home.noResultsDesc', { query: trimmed }) ||
                    `No encontramos cartas que coincidan con “${trimmed}”.`
                  }
                />
              ) : (
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
                    {searchFiltered.map((c) => (
                      <CardTile
                        key={c.id}
                        card={c}
                        meta={collection.cards[c.id]}
                        width={104}
                        onClick={() => navigate(`/card/${c.id}`)}
                        viewTransitionName={`card-image-${c.id}`}
                      />
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      alignItems: 'center',
                      padding: '10px 18px',
                    }}
                  >
                    <button
                      onClick={() =>
                        navigate(`/library?q=${encodeURIComponent(trimmed)}&mine=false&ai=true`)
                      }
                      style={{
                        background: 'var(--accent-tint)',
                        color: 'var(--accent)',
                        borderRadius: 16,
                        border: '1.5px solid var(--accent)',
                        padding: '14px 28px',
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(123, 90, 217, 0.15)',
                        transition: 'all 200ms ease',
                        width: '100%',
                        maxWidth: 280,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'var(--accent-tint)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'var(--accent-tint)';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      {t('home.semanticSearch') || '✦ Búsqueda Semántica con IA'}
                    </button>
                    <button
                      onClick={() =>
                        navigate(`/library?q=${encodeURIComponent(trimmed)}&mine=false`)
                      }
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
                        maxWidth: 280,
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
                      {t('home.viewAllResults') || 'Ver todos los resultados'}
                    </button>
                  </div>
                </div>
              )}
            </Section>
          ) : (
            <>
              {/* Herramientas IA Native */}
              <Section title={t('home.aiTools') || 'Herramientas IA Native ✦'}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    padding: '0 18px 8px',
                  }}
                >
                  <div
                    onClick={() => {
                      triggerHaptic('light');
                      navigate('/custom-card');
                    }}
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(255, 149, 0, 0.08) 0%, rgba(255, 45, 85, 0.08) 100%)',
                      border: '0.5px solid rgba(255, 149, 0, 0.25)',
                      borderRadius: 18,
                      padding: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      transition: 'all 200ms ease',
                    }}
                  >
                    <div style={{ fontSize: 24 }}>⚖️</div>
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: 'var(--ink)',
                          letterSpacing: -0.2,
                        }}
                      >
                        {t('home.customCreator') || 'Creador Custom'}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: 'var(--muted)',
                          marginTop: 2,
                          lineHeight: 1.3,
                        }}
                      >
                        {t('home.customCreatorDesc') ||
                          'Crea cartas TCG únicas en 3D holográfico interactivo.'}
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      triggerHaptic('light');
                      navigate('/decks');
                    }}
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(123, 90, 217, 0.08) 0%, rgba(47, 111, 224, 0.08) 100%)',
                      border: '0.5px solid rgba(123, 90, 217, 0.25)',
                      borderRadius: 18,
                      padding: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      transition: 'all 200ms ease',
                    }}
                  >
                    <div style={{ fontSize: 24 }}>🔮</div>
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: 'var(--ink)',
                          letterSpacing: -0.2,
                        }}
                      >
                        {t('home.deckCopilot') || 'Copiloto de Mazos'}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: 'var(--muted)',
                          marginTop: 2,
                          lineHeight: 1.3,
                        }}
                      >
                        {t('home.deckCopilotDesc') ||
                          'Construye y optimiza mazos de competición con IA.'}
                      </div>
                    </div>
                  </div>
                </div>
              </Section>

              <AISynergyFeed ownedCardNames={ownedCardNames} />

              {/* Featured */}
              <Section
                title={t('home.featuredCards') || 'Cartas destacadas'}
                action={
                  <ActionLink onClick={() => navigate('/library')}>
                    {t('home.viewAll') || 'Ver todas'}
                  </ActionLink>
                }
              >
                {owned.loading ? (
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      padding: '4px 18px 12px',
                      overflowX: 'auto',
                    }}
                    className="no-scrollbar"
                  >
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          width: 110,
                          height: 154,
                          borderRadius: 8,
                          background:
                            'linear-gradient(110deg, #EAECF1 8%, #F2F4F7 18%, #EAECF1 33%)',
                          backgroundSize: '200% 100%',
                          animation: 'shimmer 1.4s linear infinite',
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                ) : featured.length === 0 ? (
                  <div style={{ padding: '0 18px 8px', fontSize: 13, color: 'var(--muted)' }}>
                    {t('home.featuredEmpty') || 'Guarda cartas raras para verlas destacadas aquí.'}
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      overflowX: 'auto',
                      padding: '4px 18px 12px',
                    }}
                    className="no-scrollbar"
                  >
                    {featured.map((c) => (
                      <div
                        key={c.id}
                        style={{ width: 110, flexShrink: 0, cursor: 'pointer' }}
                        onClick={() => navigate(`/card/${c.id}`)}
                      >
                        <CardTile
                          card={c}
                          meta={collection.cards[c.id]}
                          width={110}
                          viewTransitionName={`card-image-${c.id}`}
                        />
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 13,
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
                        <div style={{ marginTop: 2 }}>
                          <RarityBadge rarity={c.rarity} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Rarity chips (Mockup layout) */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  padding: '4px 18px 20px',
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

              {/* Insights — collector summary */}
              {insights && (
                <Section title={t('home.collectionInsights') || 'Datos de tu colección'} tight>
                  <div
                    style={{
                      padding: '0 18px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                    }}
                  >
                    {insights.rarest && (
                      <InsightCard
                        label={t('home.rarestCard') || 'Carta más rara'}
                        title={insights.rarest.name}
                        sub={rarityLabel(insights.rarest.rarity)}
                        onClick={() => navigate(`/card/${insights.rarest!.id}`)}
                      />
                    )}
                    {insights.mostValuable && (
                      <InsightCard
                        label={t('home.highestValue') || 'Mayor valor'}
                        title={insights.mostValuable.name}
                        sub={(() => {
                          const p = getEstimatedPrice(insights.mostValuable);
                          return p ? formatPrice(p) : '—';
                        })()}
                        onClick={() => navigate(`/card/${insights.mostValuable!.id}`)}
                      />
                    )}
                    {insights.bestSet && (
                      <InsightCard
                        label={t('home.mostAdvancedSet') || 'Set más avanzado'}
                        title={insights.bestSet.name}
                        sub={
                          t('home.setCardCount', {
                            owned: insights.bestSet.owned,
                            total: insights.bestSet.total,
                          }) || `${insights.bestSet.owned}/${insights.bestSet.total} cartas`
                        }
                        onClick={() => navigate('/sets')}
                      />
                    )}
                    <InsightCard
                      label={t('home.duplicates') || 'Duplicadas'}
                      title={`${insights.duplicates}`}
                      sub={
                        insights.duplicates === 1
                          ? t('home.duplicateSingle') || 'carta con copias'
                          : t('home.duplicateMultiple') || 'cartas con copias'
                      }
                      onClick={() => navigate('/library')}
                    />
                  </div>
                </Section>
              )}

              {/* Action rows */}
              <div
                style={{
                  padding: '0 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <Surface
                  onClick={() => navigate('/library')}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: 'var(--accent-tint)',
                      color: 'var(--accent)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <SortIcon size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--ink)',
                        letterSpacing: -0.2,
                      }}
                    >
                      {t('home.sortByRarity') || 'Ordenar por rareza'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {t('home.sortByRarityDesc') || 'Mira tus cartas más raras primero'}
                    </div>
                  </div>
                  <span style={{ color: 'var(--muted-3)' }}>
                    <ChevronIcon size={16} />
                  </span>
                </Surface>
                <Surface
                  onClick={() => navigate('/sets')}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: 'rgba(242, 153, 74, 0.18)',
                      color: '#F2994A',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <BookIcon size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--ink)',
                        letterSpacing: -0.2,
                      }}
                    >
                      {t('home.expansions') || 'Expansiones'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {t('home.expansionsDesc') || 'Ver todas las series'}
                    </div>
                  </div>
                  <span style={{ color: 'var(--muted-3)' }}>
                    <ChevronIcon size={16} />
                  </span>
                </Surface>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Empty home — first-launch experience                                       */
/* ------------------------------------------------------------------------- */

function HomeEmpty({ onScan, onSearch }: { onScan: () => void; onSearch: () => void }) {
  const { t } = useI18n();
  return (
    <div style={{ padding: '8px 24px 40px' }}>
      <EmptyState
        large
        icon={<ScanIcon size={42} />}
        title={t('home.emptyTitle') || 'Aún no tienes cartas'}
        description={
          t('home.emptyDescription') ||
          'Escanea tu primera carta o búscala por nombre para empezar a construir tu binder digital.'
        }
        action={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              onClick={onScan}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                padding: '13px 24px',
                fontSize: 15,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: -0.1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: 'var(--shadow-accent)',
              }}
            >
              <ScanIcon size={18} color="#fff" />
              {t('home.emptyButton') || 'Escanear carta'}
            </button>
            <button
              onClick={onSearch}
              style={{
                background: 'transparent',
                color: 'var(--accent)',
                border: '0.5px solid var(--border)',
                borderRadius: 14,
                padding: '12px 22px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: -0.1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <SearchIcon size={16} />
              {t('home.searchButton') || 'Buscar cartas'}
            </button>
          </div>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Insight tile                                                              */
/* ------------------------------------------------------------------------- */

function InsightCard({
  label,
  title,
  sub,
  onClick,
}: {
  label: string;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 14,
        background: 'var(--surface)',
        border: '0.5px solid var(--border)',
        borderRadius: 16,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minHeight: 84,
        boxShadow: 'var(--shadow-1)',
        transition: 'transform 120ms, box-shadow 200ms',
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          color: 'var(--muted)',
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          color: 'var(--ink)',
          fontWeight: 700,
          letterSpacing: -0.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {sub}
      </span>
    </button>
  );
}
