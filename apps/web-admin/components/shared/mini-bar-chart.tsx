'use client';

import { useState } from 'react';
import type { DashboardDailyPoint } from '@toolhackchain/shared';

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / pow) * pow;
}
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Single-series bars over 7 days. Rounded tops, 2px gaps, hover tooltip. */
export function MiniBarChart({
  data,
  color = '#722ed1',
}: {
  data: DashboardDailyPoint[];
  color?: string;
}) {
  const W = 560, H = 240, PL = 40, PR = 16, PT = 16, PB = 28;
  const iw = W - PL - PR, ih = H - PT - PB;
  const max = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const band = data.length ? iw / data.length : iw;
  const barW = Math.min(40, band - 10);
  const y = (v: number) => PT + ih - (v / max) * ih;
  const [hi, setHi] = useState<number | null>(null);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bar chart"
        onMouseLeave={() => setHi(null)}>
        {[0, 0.5, 1].map((t) => {
          const gy = PT + ih - t * ih;
          return (
            <g key={t}>
              <line x1={PL} x2={W - PR} y1={gy} y2={gy} stroke="#f0f0f0" />
              <text x={PL - 6} y={gy + 4} textAnchor="end" fontSize="10" fill="#999">
                {Math.round(t * max)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = PL + band * i + band / 2;
          const h = ih - (y(d.value) - PT);
          return (
            <g key={d.date} onMouseEnter={() => setHi(i)}>
              <rect x={cx - barW / 2} y={y(d.value)} width={barW} height={Math.max(0, h)}
                rx={4} fill={color} opacity={hi === null || hi === i ? 1 : 0.55} />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#999">{fmtDate(d.date)}</text>
              <rect x={cx - band / 2} y={PT} width={band} height={ih} fill="transparent"
                onMouseEnter={() => setHi(i)} />
            </g>
          );
        })}
      </svg>
      {hi != null && (
        <div style={{
          position: 'absolute', top: 0, left: `${((PL + band * hi + band / 2) / W) * 100}%`,
          transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: '#fff',
          padding: '4px 8px', borderRadius: 4, fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {fmtDate(data[hi].date)}: <strong>{data[hi].value}</strong>
        </div>
      )}
    </div>
  );
}
