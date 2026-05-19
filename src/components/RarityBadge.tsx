import { rarityColor, rarityIcon, rarityLabel } from '@/lib/rarity';

export interface RarityBadgeProps {
  rarity?: string | null;
  size?: 'sm' | 'lg';
}

export default function RarityBadge({ rarity, size = 'sm' }: RarityBadgeProps) {
  const color = rarityColor(rarity);
  const label = rarityLabel(rarity);
  const icon = rarityIcon(rarity);
  const small = size === 'sm';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: color + '22',
        color,
        fontSize: small ? 11 : 13,
        fontWeight: 700,
        padding: small ? '3px 8px' : '5px 11px',
        borderRadius: 999,
        letterSpacing: -0.1,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: small ? 9 : 11 }}>{icon}</span>
      {label}
    </span>
  );
}
