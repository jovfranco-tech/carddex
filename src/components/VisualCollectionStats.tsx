import React, { useState, useMemo } from 'react';
import { getEstimatedPrice, formatCollectionValue, prefersMXN } from '@/lib/pricing';
import type { PokemonCard } from '@/types/pokemon';
import type { CollectionState } from '@/types/collection';
import { formatInt } from '@/lib/formatters';

interface VisualCollectionStatsProps {
  ownedCards: PokemonCard[];
  collection: CollectionState;
  title?: string;
  isDeck?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  Grass: '#48C058',
  Fire: '#FF421F',
  Water: '#2196F3',
  Lightning: '#FFC107',
  Psychic: '#9C27B0',
  Fighting: '#FF5722',
  Darkness: '#37474F',
  Metal: '#78909C',
  Dragon: '#7E57C2',
  Colorless: '#9E9E9E',
  Fairy: '#EC407A',
};

const TYPE_LABELS: Record<string, string> = {
  Grass: 'Planta',
  Fire: 'Fuego',
  Water: 'Agua',
  Lightning: 'Rayo',
  Psychic: 'Psíquico',
  Fighting: 'Lucha',
  Darkness: 'Oscuridad',
  Metal: 'Metal',
  Dragon: 'Dragón',
  Colorless: 'Incoloro',
  Fairy: 'Hada',
};

export default function VisualCollectionStats({
  ownedCards,
  collection,
  title = 'Análisis de Colección',
  isDeck = false,
}: VisualCollectionStatsProps) {
  const [activeTab, setActiveTab] = useState<'types' | 'rarity'>('types');

  // 1. Calculate pricing metrics
  const pricingTotals = useMemo(() => {
    let usd = 0;
    let eur = 0;
    let cardsWithPrice = 0;
    let totalQty = 0;

    ownedCards.forEach((c) => {
      // In a deck context, quantity is 1 unless mapped. In collection it is from collection state.
      const qty = isDeck ? 1 : (collection.cards[c.id]?.quantity ?? 1);
      totalQty += qty;
      const p = getEstimatedPrice(c);
      if (p) {
        cardsWithPrice++;
        if (p.currency === 'USD') usd += p.value * qty;
        else eur += p.value * qty;
      }
    });

    return { usd, eur, cardsWithPrice, totalQty };
  }, [ownedCards, collection, isDeck]);

  // 2. Element Types Breakdown
  const typeStats = useMemo(() => {
    const counts: Record<string, number> = {};
    let totalPkmn = 0;

    ownedCards.forEach((c) => {
      const qty = isDeck ? 1 : (collection.cards[c.id]?.quantity ?? 1);
      const isPkmn =
        c.supertype?.toLowerCase().includes('pokémon') ||
        c.supertype?.toLowerCase().includes('pokemon');
      
      if (isPkmn) {
        const types = c.types && c.types.length > 0 ? c.types : ['Colorless'];
        types.forEach((t) => {
          counts[t] = (counts[t] || 0) + qty;
          totalPkmn += qty;
        });
      }
    });

    const total = totalPkmn || 1;
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1]);

    const R = 36;
    const C = 2 * Math.PI * R; // Circumference ~226.19

    let accumulatedPercent = 0;
    const segments = sorted.map(([type, count]) => {
      const percent = count / total;
      const strokeLength = percent * C;
      const strokeOffset = accumulatedPercent * C;
      accumulatedPercent += percent;

      return {
        type,
        count,
        percent: Math.round(percent * 100),
        strokeDasharray: `${strokeLength} ${C}`,
        strokeDashoffset: -strokeOffset,
        color: TYPE_COLORS[type] || '#9E9E9E',
        label: TYPE_LABELS[type] || type,
      };
    });

    return { segments, totalPkmn };
  }, [ownedCards, collection, isDeck]);

  // 3. Rarity Breakdown
  const rarityStats = useMemo(() => {
    const groups = {
      common: {
        label: 'Comunes',
        count: 0,
        color: '#B0BEC5',
        gradient: 'linear-gradient(90deg, #78909C, #B0BEC5)',
      },
      uncommon: {
        label: 'Infrecuentes',
        count: 0,
        color: '#90A4AE',
        gradient: 'linear-gradient(90deg, #546E7A, #90A4AE)',
      },
      rare: {
        label: 'Raras / Holo',
        count: 0,
        color: '#FFC107',
        gradient: 'linear-gradient(90deg, #FF8F00, #FFC107)',
      },
      ultra: {
        label: 'Ultra / ex / V',
        count: 0,
        color: '#E040FB',
        gradient: 'linear-gradient(90deg, #AA00FF, #E040FB)',
      },
    };

    let total = 0;
    ownedCards.forEach((c) => {
      const qty = isDeck ? 1 : (collection.cards[c.id]?.quantity ?? 1);
      total += qty;
      const r = (c.rarity || '').toLowerCase();
      if (r.includes('common') || r.includes('común')) {
        groups.common.count += qty;
      } else if (r.includes('uncommon') || r.includes('infrecuente')) {
        groups.uncommon.count += qty;
      } else if (
        r.includes('rare holo') ||
        r.includes('rare') ||
        r.includes('promo') ||
        r.includes('holofoil')
      ) {
        groups.rare.count += qty;
      } else if (
        r.includes('ultra') ||
        r.includes('ex') ||
        r.includes('vmax') ||
        r.includes('vstar') ||
        r.includes('secret') ||
        r.includes('hyper') ||
        r.includes('rare holo v')
      ) {
        groups.ultra.count += qty;
      } else {
        groups.common.count += qty;
      }
    });

    const maxCount = Math.max(
      1,
      ...Object.values(groups).map((g) => g.count)
    );

    return {
      total,
      list: Object.values(groups).map((g) => ({
        ...g,
        percent: Math.round((g.count / (total || 1)) * 100),
        barWidthPercent: Math.round((g.count / maxCount) * 100),
      })),
    };
  }, [ownedCards, collection, isDeck]);

  const valueFormatted = formatCollectionValue(pricingTotals);

  return (
    <div style={{ padding: '0 14px 14px' }}>
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(24, 28, 48, 0.85), rgba(12, 14, 26, 0.95))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 24,
          padding: '20px 18px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow Effects */}
        <div
          style={{
            position: 'absolute',
            top: -50,
            right: -50,
            width: 150,
            height: 150,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -50,
            left: -50,
            width: 150,
            height: 150,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: '#FFFFFF',
            letterSpacing: -0.3,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{title}</span>
          <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', fontWeight: 500 }}>
            {pricingTotals.totalQty} cartas
          </span>
        </div>

        {/* Pricing Metrics KPI */}
        {!isDeck && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 16,
              padding: '14px 16px',
              border: '0.5px solid rgba(255, 255, 255, 0.05)',
              marginBottom: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', fontWeight: 600 }}>
              Valor Total Estimado
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: '#10B981', // Emerald green
                letterSpacing: -0.8,
                textShadow: '0 2px 10px rgba(16, 185, 129, 0.2)',
              }}
            >
              {valueFormatted === '—' ? 'Sin precios' : valueFormatted}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.35)', lineHeight: 1.3 }}>
              Basado en {pricingTotals.cardsWithPrice} de {ownedCards.length} cartas con valor de mercado disponible.
            </div>
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 12,
            padding: 3,
            marginBottom: 20,
            gap: 4,
          }}
        >
          <button
            onClick={() => setActiveTab('types')}
            style={{
              flex: 1,
              background: activeTab === 'types' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeTab === 'types' ? '#FFF' : 'rgba(255, 255, 255, 0.5)',
              border: 'none',
              borderRadius: 9,
              padding: '8px 0',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 200ms ease',
            }}
          >
            Tipos Elementales
          </button>
          <button
            onClick={() => setActiveTab('rarity')}
            style={{
              flex: 1,
              background: activeTab === 'rarity' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: activeTab === 'rarity' ? '#FFF' : 'rgba(255, 255, 255, 0.5)',
              border: 'none',
              borderRadius: 9,
              padding: '8px 0',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 200ms ease',
            }}
          >
            Distribución Rarezas
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'types' ? (
          typeStats.segments.length === 0 ? (
            <div style={{ color: 'rgba(255, 255, 255, 0.4)', textAlign: 'center', fontSize: 13, padding: '20px 0' }}>
              No hay Pokémon en la lista para analizar.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {/* SVG Donut Chart */}
              <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
                <svg width="90" height="90" viewBox="0 0 100 100">
                  {/* Background track circle */}
                  <circle cx="50" cy="50" r="36" fill="transparent" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="12" />
                  {/* Segment circles */}
                  {typeStats.segments.map((seg, idx) => (
                    <circle
                      key={seg.type}
                      cx="50"
                      cy="50"
                      r="36"
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="12"
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      transform="rotate(-90 50 50)"
                      strokeLinecap={seg.percent === 100 ? 'butt' : 'round'}
                      style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                    />
                  ))}
                </svg>
                {/* Center text overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)', fontWeight: 600 }}>Tipos</span>
                  <span style={{ fontSize: 14, color: '#FFF', fontWeight: 900 }}>
                    {Object.keys(typeStats.segments).length}
                  </span>
                </div>
              </div>

              {/* Legends */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 110, overflowY: 'auto' }} className="no-scrollbar">
                {typeStats.segments.slice(0, 5).map((seg) => (
                  <div key={seg.type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color }} />
                      <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: 600 }}>{seg.label}</span>
                    </div>
                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontWeight: 700 }}>
                      {seg.count} ({seg.percent}%)
                    </span>
                  </div>
                ))}
                {typeStats.segments.length > 5 && (
                  <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.35)', paddingLeft: 14, fontWeight: 500 }}>
                    + {typeStats.segments.length - 5} tipos adicionales
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          /* Rarity Distribution bars */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rarityStats.list.map((group) => (
              <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: 600 }}>{group.label}</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontWeight: 700 }}>
                    {group.count} <span style={{ fontSize: 10, fontWeight: 500 }}>({group.percent}%)</span>
                  </span>
                </div>
                {/* Progress bar container */}
                <div
                  style={{
                    height: 8,
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: 99,
                    overflow: 'hidden',
                    border: '0.5px solid rgba(255,255,255,0.02)',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${group.barWidthPercent}%`,
                      background: group.gradient,
                      borderRadius: 99,
                      boxShadow: `0 0 8px ${group.color}40`,
                      transition: 'width 0.4s ease-out',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
