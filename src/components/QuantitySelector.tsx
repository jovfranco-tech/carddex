import { MinusIcon, PlusIcon } from './icons';

export interface QuantitySelectorProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

export default function QuantitySelector({
  value,
  onChange,
  min = 0,
  max = 999,
}: QuantitySelectorProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: '#F2F3F7',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={dec}
        aria-label="Disminuir cantidad"
        disabled={value <= min}
        style={{
          width: 40,
          height: 40,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MinusIcon size={16} />
      </button>
      <div
        style={{
          width: 36,
          textAlign: 'center',
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--ink)',
        }}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={inc}
        aria-label="Aumentar cantidad"
        disabled={value >= max}
        style={{
          width: 40,
          height: 40,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  );
}
