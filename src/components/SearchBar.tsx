import { type ChangeEvent, type KeyboardEvent } from 'react';
import { SearchIcon, CloseIcon } from './icons';

export interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Buscar cartas, expansiones, tipos…',
  autoFocus = false,
}: SearchBarProps) {
  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) onSubmit();
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 14,
        border: '0.5px solid var(--border)',
        boxShadow: '0 1px 2px rgba(15,20,40,0.03)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
      }}
    >
      <span style={{ color: 'var(--muted-3)', display: 'inline-flex' }}>
        <SearchIcon size={18} />
      </span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        type="search"
        aria-label="Buscar cartas"
        enterKeyHint="search"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 14,
          color: 'var(--ink)',
          fontFamily: 'inherit',
          minWidth: 0,
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-3)',
            display: 'inline-flex',
            padding: 0,
          }}
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}
