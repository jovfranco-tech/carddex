import Surface from '@/components/Surface';
import QuantitySelector from '@/components/QuantitySelector';
import FoilToggle from '@/components/FoilToggle';
import { CheckIcon, TrashIcon } from '@/components/icons';
import type { CardCondition, CardVariant } from '@/types/collection';

interface AddToCollectionPanelProps {
  qty: number;
  setQty: (q: number) => void;
  foil: boolean;
  setFoil: (f: boolean) => void;
  variant: CardVariant;
  setVariant: (v: CardVariant) => void;
  condition: CardCondition;
  setCondition: (c: CardCondition) => void;
  saved: boolean;
  handleSave: () => void;
  handleRemove: () => void;
}

export default function AddToCollectionPanel({
  qty,
  setQty,
  foil,
  setFoil,
  variant,
  setVariant,
  condition,
  setCondition,
  saved,
  handleSave,
  handleRemove,
}: AddToCollectionPanelProps) {
  return (
    <div style={{ padding: '0 14px 12px' }}>
      <Surface style={{ padding: 16 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--ink)',
            letterSpacing: -0.2,
            marginBottom: 12,
          }}
        >
          Agregar a mi colección
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <QuantitySelector value={qty} onChange={setQty} min={1} />
          <FoilToggle value={foil} onChange={setFoil} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <SelectField
            label="Variante"
            value={variant}
            onChange={(v) => setVariant(v as CardVariant)}
            options={['Normal', 'Holo', 'Reverse Holo', 'Promo'] as const}
          />
          <SelectField
            label="Condición"
            value={condition}
            onChange={(v) => setCondition(v as CardCondition)}
            options={
              [
                'Mint',
                'Near Mint',
                'Lightly Played',
                'Moderately Played',
                'Heavily Played',
                'Damaged',
              ] as const
            }
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: saved ? '1fr 1fr' : '1fr', gap: 10 }}>
          <button
            onClick={handleSave}
            style={{
              width: '100%',
              padding: '13px',
              background: saved ? 'var(--success)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: -0.2,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background 200ms',
            }}
          >
            <CheckIcon size={18} color="#fff" />
            {saved ? 'Guardado' : 'Guardar en mi colección'}
          </button>

          {saved && (
            <button
              onClick={handleRemove}
              style={{
                width: '100%',
                padding: '13px',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: -0.2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 200ms, border-color 200ms',
              }}
            >
              <TrashIcon size={18} color="#ef4444" />
              Quitar
            </button>
          )}
        </div>
      </Surface>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<string>;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--muted)',
          letterSpacing: 0.2,
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: 'relative',
          background: 'var(--bg)',
          borderRadius: 12,
          border: '0.5px solid var(--border)',
        }}
      >
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink)',
            padding: '10px 28px 10px 12px',
            width: '100%',
            cursor: 'pointer',
            letterSpacing: -0.1,
          }}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
            fontSize: 10,
            pointerEvents: 'none',
          }}
        >
          ▾
        </span>
      </div>
    </label>
  );
}
