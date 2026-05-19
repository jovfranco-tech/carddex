import { formatPrice, type EstimatedPrice } from '@/lib/pricing';

export interface PriceBadgeProps {
  price: EstimatedPrice | null;
  size?: 'sm' | 'lg';
}

export default function PriceBadge({ price, size = 'sm' }: PriceBadgeProps) {
  const small = size === 'sm';
  if (!price) {
    return (
      <span
        style={{
          fontSize: small ? 12 : 14,
          fontWeight: 600,
          color: 'var(--muted)',
        }}
      >
        Sin precio
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: small ? 13 : 16,
        fontWeight: 800,
        color: 'var(--success)',
        letterSpacing: -0.2,
      }}
      title={price.source}
    >
      {formatPrice(price)}
    </span>
  );
}
