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

/** Single-series line over 7 days. Recessive axes, 2px line, hover tooltip. */
export function MiniLineChart({
  data,
  color = '#1677ff',
}: {
  data: DashboardDailyPoint[];
  color?: string;
}) {
  const W = 560, H = 240, PL = 40, PR = 16, PT = 16, PB = 28;
  const iw = W - PL - PR, ih = H - PT - PB;
  const max = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const x = (i: number) =>
    data.length <= 1 ? PL + iw / 2 : PL + (i * iw) / (data.length - 1);
  const y = (v: number) => PT + ih - (v / max) * ih;
  const [hi, setHi] = useState<number | null>(null);
  const band = data.length ? iw / data.length : iw;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Line chart"
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
        {data.map((d, i) => (
          <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#999">
            {fmtDate(d.date)}
          </text>
        ))}
        {hi != null && (
          <line x1={x(hi)} x2={x(hi)} y1={PT} y2={PT + ih} stroke={color} strokeDasharray="3 3" opacity={0.4} />
        )}
        <polyline
          points={data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')}
          fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
        />
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.value)} r={hi === i ? 5 : 4} fill={color} />
            <rect x={x(i) - band / 2} y={PT} width={band} height={ih} fill="transparent"
              onMouseEnter={() => setHi(i)} />
          </g>
        ))}
      </svg>
      {hi != null && (
        <div style={{
          position: 'absolute', top: 0, left: `${(x(hi) / W) * 100}%`,
          transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: '#fff',
          padding: '4px 8px', borderRadius: 4, fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {fmtDate(data[hi].date)}: <strong>{data[hi].value}</strong>
        </div>
      )}
    </div>
  );
}
