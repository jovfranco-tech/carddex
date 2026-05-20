import { useState, useEffect, useRef } from 'react';
import TcgCardImage from '@/components/TcgCardImage';
import { SearchIcon } from '@/components/icons';
import { searchCards } from '@/lib/pokemonTcgApi';
import { useDebounced } from '@/lib/hooks';
import type { PokemonCard } from '@/types/pokemon';

interface CorrectionSheetProps {
  onClose: () => void;
  onPick: (card: PokemonCard) => void;
}

export default function CorrectionSheet({
  onClose,
  onPick,
}: CorrectionSheetProps) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 280);
  const [results, setResults] = useState<PokemonCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults([]);
      setErr(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setErr(null);
    searchCards({ name: debounced, pageSize: 12 })
      .then((res) => {
        if (id !== reqId.current) return;
        setResults(res.data);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setErr(e instanceof Error ? e.message : 'Error al buscar cartas');
        setResults([]);
      })
      .finally(() => {
        if (id !== reqId.current) return;
        setLoading(false);
      });
  }, [debounced]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'fadeIn 220ms ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#15171E',
          color: '#fff',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: '14px 18px 30px',
          animation: 'slideUp 280ms cubic-bezier(.2,.8,.2,1)',
          maxHeight: '70%',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 999,
            margin: '0 auto 14px',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>
            Buscar carta
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
        </div>
        <div
          style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <SearchIcon size={16} color="rgba(255,255,255,0.55)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre del Pokémon…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 14,
              outline: 'none',
            }}
            autoFocus
          />
        </div>
        {loading && (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 13,
            }}
          >
            Buscando…
          </div>
        )}
        {err && (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              color: '#FF6B61',
              fontSize: 13,
            }}
          >
            {err}
          </div>
        )}
        {!loading && !err && !debounced && (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 13,
            }}
          >
            Escribe el nombre del Pokémon para buscar
          </div>
        )}
        {!loading && !err && debounced && results.length === 0 && (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 13,
            }}
          >
            Sin resultados para “{debounced}”
          </div>
        )}
        {results.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
            }}
          >
            {results.map((c) => (
              <div
                key={c.id}
                onClick={() => onPick(c)}
                style={{ cursor: 'pointer' }}
              >
                <TcgCardImage card={c} width={92} />
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    marginTop: 6,
                    color: 'rgba(255,255,255,0.9)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.5)',
                  }}
                >
                  {c.set?.name ?? '—'} · {c.number}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
