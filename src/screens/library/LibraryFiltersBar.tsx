import React, { useState } from 'react';
import Surface from '@/components/Surface';
import Chip from '@/components/Chip';
import { formatInt } from '@/lib/formatters';
import { ChevronDownIcon, GridIcon, ListIcon, LayersIcon, BookIcon } from '@/components/icons';
import { SORT_LABELS, type SortKey } from './libraryHelpers';
import { RARITY_FILTERS } from '@/lib/rarity';

interface LibraryFiltersBarProps {
  rarityFilter: string;
  setRarityFilter: (rarity: string) => void;
  onlyMine: boolean;
  setOnlyMine: (mine: boolean | ((prev: boolean) => boolean)) => void;
  totalQuantity: number;
  sort: SortKey;
  setSort: (sort: SortKey) => void;
  view: 'grid' | 'list' | 'sets' | 'binder';
  setView: (view: 'grid' | 'list' | 'sets' | 'binder') => void;
}

export default function LibraryFiltersBar({
  rarityFilter,
  setRarityFilter,
  onlyMine,
  setOnlyMine,
  totalQuantity,
  sort,
  setSort,
  view,
  setView,
}: LibraryFiltersBarProps) {
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <div className="container-query-filters">
      {/* Sort + view */}
      <div
        className="filters-row"
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
          aria-expanded={sortOpen}
          aria-label={`Ordenar cartas por ${SORT_LABELS[sort]}`}
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
                type="button"
                onClick={() => setView(k)}
                aria-label={label}
                aria-pressed={view === k}
                style={{
                  width: 30,
                  height: 28,
                  borderRadius: 9,
                  background: view === k ? 'var(--surface)' : 'transparent',
                  color: view === k ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: view === k ? '0 1px 2px rgba(15,20,40,0.08)' : 'none',
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
                type="button"
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
          <Chip key={f.key} active={rarityFilter === f.key} onClick={() => setRarityFilter(f.key)}>
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
            type="button"
            onClick={() => setOnlyMine((o) => !o)}
            aria-label={onlyMine ? 'Mostrar todas las cartas' : 'Mostrar solo mis cartas'}
            aria-pressed={onlyMine}
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
    </div>
  );
}
