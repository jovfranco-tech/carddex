const TYPE_COLORS: Record<string, { color: string; glyph: string; nameEs: string }> = {
  Colorless: { color: '#B6B7C4', glyph: '○', nameEs: 'Incolor' },
  Darkness: { color: '#3D2A78', glyph: '◐', nameEs: 'Oscuridad' },
  Dragon: { color: '#B58A2C', glyph: '✺', nameEs: 'Dragón' },
  Fairy: { color: '#D363B9', glyph: '✧', nameEs: 'Hada' },
  Fighting: { color: '#8B4513', glyph: '✦', nameEs: 'Lucha' },
  Fire: { color: '#EB5757', glyph: '✸', nameEs: 'Fuego' },
  Grass: { color: '#27AE60', glyph: '✦', nameEs: 'Planta' },
  Lightning: { color: '#F2C94C', glyph: '⚡', nameEs: 'Eléctrico' },
  Metal: { color: '#8E92A0', glyph: '◫', nameEs: 'Metal' },
  Psychic: { color: '#7B5AD9', glyph: '✧', nameEs: 'Psíquico' },
  Water: { color: '#2F80ED', glyph: '◈', nameEs: 'Agua' },
};

export interface TypeBadgeProps {
  type?: string | null;
}

export default function TypeBadge({ type }: TypeBadgeProps) {
  if (!type) return null;
  const meta = TYPE_COLORS[type] ?? { color: '#8E92A0', glyph: '●', nameEs: type };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--ink-3)',
        letterSpacing: -0.1,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: meta.color,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {meta.glyph}
      </span>
      {meta.nameEs}
    </span>
  );
}

export function typeColor(type?: string | null): string {
  if (!type) return '#8E92A0';
  return TYPE_COLORS[type]?.color ?? '#8E92A0';
}
