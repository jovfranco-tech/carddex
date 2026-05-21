import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, forwardRef } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import CardTile from '@/components/CardTile';
import Surface from '@/components/Surface';
import TcgCardImage from '@/components/TcgCardImage';
import RarityBadge from '@/components/RarityBadge';
import PriceBadge from '@/components/PriceBadge';
import EmptyState from '@/components/EmptyState';
import { getEstimatedPrice } from '@/lib/pricing';
import type { PokemonCard } from '@/types/pokemon';
import type { CollectionState } from '@/types/collection';

/** SetGroup shape — computed inside LibraryScreen.bySetGroups. */
export interface SetGroupData {
  setId: string;
  setName: string;
  setSeries: string;
  setSymbol: string | null;
  printedTotal: number;
  cards: PokemonCard[];
}

interface SetGroupCardProps {
  setId: string;
  setName: string;
  setSeries: string;
  setSymbol: string | null;
  printedTotal: number;
  cards: PokemonCard[];
  collection: CollectionState;
  onCard: (id: string) => void;
  onFilter: (id: string) => void;
}

/** Inline set-group card (kept co-located since it is only used here). */
function SetGroupCard({
  setId,
  setName,
  setSeries,
  printedTotal,
  cards,
  collection,
  onCard,
  onFilter,
}: SetGroupCardProps) {
  const pct = printedTotal > 0 ? Math.round((cards.length / printedTotal) * 100) : 0;
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 18,
        padding: '14px 16px',
        border: '0.5px solid var(--border)',
      }}
    >
      {/* Set header */}
      <button
        onClick={() => onFilter(setId)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          marginBottom: 10,
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.2 }}>
            {setName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {setSeries} · {cards.length}/{printedTotal} cartas ({pct}%)
          </div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: 'var(--muted)', flexShrink: 0 }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Card strip */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {cards.slice(0, 12).map((c) => (
          <div key={c.id} style={{ flexShrink: 0 }}>
            <CardTile
              card={c}
              meta={collection.cards[c.id]}
              width={72}
              onClick={() => onCard(c.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Load-more button shared between grid and list views ────────────────────

interface LoadMoreButtonProps {
  remaining: number;
  onLoadMore: () => void;
}

function LoadMoreButton({ remaining, onLoadMore }: LoadMoreButtonProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 18px' }}>
      <button
        onClick={onLoadMore}
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
        Cargar más ({remaining} restantes)
      </button>
    </div>
  );
}

// ─── Main CardListView ───────────────────────────────────────────────────────

export interface CardListViewProps {
  view: 'grid' | 'list' | 'sets' | 'binder';
  filteredCards: PokemonCard[];
  collection: CollectionState;
  onlyMine: boolean;
  visibleCount: number;
  onLoadMore: () => void;
  /** For binder pagination */
  binderPage: number;
  totalBinderPages: number;
  binderCards: PokemonCard[];
  onBinderPrev: () => void;
  onBinderNext: () => void;
  /** For sets view */
  bySetGroups: SetGroupData[];
  onSetFilter: (setId: string) => void;
}

/**
 * CardListView — renders the card collection in the selected view mode.
 *
 * Extracted from LibraryScreen.tsx for maintainability.
 * The parent is responsible for all state; this component is purely presentational.
 */
export default function CardListView({
  view,
  filteredCards,
  collection,
  onlyMine,
  visibleCount,
  onLoadMore,
  binderPage,
  totalBinderPages,
  binderCards,
  onBinderPrev,
  onBinderNext,
  bySetGroups,
  onSetFilter,
}: CardListViewProps) {
  const navigate = useNavigate();
  const observerTargetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTargetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && filteredCards.length > visibleCount) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [filteredCards.length, visibleCount, onLoadMore]);

  if (filteredCards.length === 0) {
    return (
      <EmptyState
        title="Sin resultados"
        description="Cambia los filtros o desactiva 'Solo mis cartas' para ver más."
      />
    );
  }

  // ── Sets view ──────────────────────────────────────────────────────────────
  if (view === 'sets') {
    return (
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
            onFilter={onSetFilter}
          />
        ))}
      </div>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────────
  if (view === 'grid') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <VirtuosoGrid
          useWindowScroll
          data={filteredCards.slice(0, visibleCount)}
          components={{
            List: forwardRef<HTMLDivElement, any>(({ style, children, ...props }, ref) => (
              <div
                ref={ref}
                {...props}
                style={{
                  ...style,
                  padding: '0 18px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                  justifyItems: 'center',
                }}
              >
                {children}
              </div>
            )),
            Item: ({ children, ...props }) => (
              <div {...props} style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                {children}
              </div>
            ),
          }}
          itemContent={(index, c) => (
            <CardTile
              card={c}
              meta={collection.cards[c.id]}
              width={104}
              onClick={() => navigate(`/card/${c.id}`)}
              showMissingState={!onlyMine}
            />
          )}
        />
        {filteredCards.length > visibleCount ? (
          <div
            ref={observerTargetRef}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '16px 0',
              opacity: 0.8,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: '2px solid rgba(255, 255, 255, 0.08)',
                borderTopColor: 'var(--accent)',
                animation: 'spinLoader 0.8s linear infinite',
              }}
            />
            <style>{`
              @keyframes spinLoader {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Binder view ────────────────────────────────────────────────────────────
  if (view === 'binder') {
    return (
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

          {/* 3×3 Grid of Pockets */}
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
              }
              return (
                <div key={`empty-${index}`} className="binder-pocket empty-pocket">
                  <div className="empty-pocket-inner">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      style={{ opacity: 0.25 }}
                    >
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
            })}
          </div>
        </div>

        {/* Floating pagination controls */}
        <div
          style={{
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
          }}
        >
          <button
            disabled={binderPage === 1}
            onClick={onBinderPrev}
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
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--ink)',
              minWidth: 100,
              textAlign: 'center',
            }}
          >
            Pág. {binderPage} de {totalBinderPages}
          </span>

          <button
            disabled={binderPage === totalBinderPages}
            onClick={onBinderNext}
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
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── List view (fallback) ───────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Virtuoso
        useWindowScroll
        data={filteredCards.slice(0, visibleCount)}
        components={{
          List: forwardRef<HTMLDivElement, any>(({ style, children, ...props }, ref) => (
            <div
              ref={ref}
              {...props}
              style={{
                ...style,
                padding: '0 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {children}
            </div>
          )),
        }}
        itemContent={(index, c) => (
          <div style={{ paddingBottom: 8 }}>
            <Surface
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
          </div>
        )}
      />
      {filteredCards.length > visibleCount ? (
        <div
          ref={observerTargetRef}
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px 0',
            opacity: 0.8,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '2px solid rgba(255, 255, 255, 0.08)',
              borderTopColor: 'var(--accent)',
              animation: 'spinLoader 0.8s linear infinite',
            }}
          />
          <style>{`
            @keyframes spinLoader {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : null}
    </div>
  );
}
