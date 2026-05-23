import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface PriceHistoryChartProps {
  basePrice: number;
  cardName: string;
}

export default function PriceHistoryChart({ basePrice, cardName }: PriceHistoryChartProps) {
  const data = useMemo(() => {
    const points = [];
    const today = new Date();
    
    // Deterministic random seed based on cardName to keep chart stable on re-renders
    let seed = 0;
    for (let i = 0; i < cardName.length; i++) {
      seed += cardName.charCodeAt(i);
    }
    
    const pseudoRandom = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    let currentPrice = basePrice * 0.95; // start slightly lower

    for (let i = 30; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      // Daily walk fluctuation (-3% to +3.5%)
      const change = (pseudoRandom() * 6.5 - 3) / 100;
      currentPrice = currentPrice * (1 + change);
      
      points.push({
        date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        Precio: parseFloat(currentPrice.toFixed(2)),
      });
    }
    return points;
  }, [basePrice, cardName]);

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 18,
        padding: '16px 20px 20px',
        border: '0.5px solid rgba(255, 255, 255, 0.08)',
        marginTop: 20,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0, color: 'var(--ink)' }}>
          Tendencia de Mercado (30d)
        </h4>
        <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, background: 'rgba(52, 199, 89, 0.1)', padding: '2px 8px', borderRadius: 999 }}>
          ▲ +5.2%
        </span>
      </div>

      <div style={{ width: '100%', minWidth: 0, height: 160, minHeight: 160 }}>
        <ResponsiveContainer width="100%" height={160} minWidth={1} minHeight={1}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255, 255, 255, 0.04)" />
            <XAxis
              dataKey="date"
              stroke="var(--muted)"
              fontSize={9}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--muted)"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(20, 22, 30, 0.95)',
                border: '0.5px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 10,
                fontSize: 11.5,
                color: '#fff',
                fontFamily: 'inherit',
              }}
              formatter={(value: any) => [`$${value}`, 'Precio']}
              labelStyle={{ fontWeight: 700, color: 'var(--muted)', fontSize: 9.5 }}
            />
            <Area
              type="monotone"
              dataKey="Precio"
              stroke="var(--accent)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPrice)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
