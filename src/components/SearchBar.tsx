import { type ChangeEvent, type KeyboardEvent, useState, useRef } from 'react';
import { SearchIcon, CloseIcon } from './icons';
import { compressForAI } from '@/lib/imageOptimization';
import { triggerHaptic } from '@/lib/haptic';

export interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  onImageSearch?: (base64Image: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function SearchBar({
  value,
  onChange,
  onSubmit,
  onImageSearch,
  placeholder = 'Buscar cartas, expansiones, tipos…',
  autoFocus = false,
}: SearchBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) onSubmit();
  };

  const handleCameraClick = () => {
    triggerHaptic('light');
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageSearch) return;

    setCompressing(true);
    try {
      const reader = new FileReader();
      const base64Raw = await new Promise<string>((resolve, reject) => {
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });

      const compressed = await compressForAI(base64Raw);
      onImageSearch(compressed);
    } catch (err) {
      console.error('Error compressing image:', err);
    } finally {
      setCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
            cursor: 'pointer',
            marginRight: onImageSearch ? 4 : 0,
          }}
        >
          <CloseIcon size={16} />
        </button>
      )}

      {onImageSearch && (
        <>
          <button
            type="button"
            onClick={handleCameraClick}
            disabled={compressing}
            aria-label="Buscar por imagen"
            style={{
              background: 'transparent',
              border: 'none',
              color: compressing ? 'var(--accent)' : 'var(--muted-3)',
              display: 'inline-flex',
              padding: 2,
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 200ms ease',
            }}
          >
            {compressing ? (
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '1.5px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  animation: 'spinSearchLoader 0.6s linear infinite',
                }}
              />
            ) : (
              <CameraIcon size={18} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </>
      )}
    </div>
  );
}

function CameraIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
