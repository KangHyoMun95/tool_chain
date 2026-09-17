'use client';

import { useId, useState } from 'react';
import type { DashboardDailyPoint } from '@toolhackchain/shared';

const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / pow) * pow;
}
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/**
 * Neon single-series line over 7 days (Stitch "Redesigned Dashboard" look):
 * gradient area fill, glowing stroke, pulsing peak marker + badge, mono axes.
 */
export function MiniLineChart({
  data,
  color = '#22D3EE',
}: {
  data: DashboardDailyPoint[];
  color?: string;
}) {
  const W = 600, H = 280, PL = 45, PR = 25, PT = 24, PB = 70;
  const iw = W - PL - PR, ih = H - PT - PB;
  const max = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const x = (i: number) =>
    data.length <= 1 ? PL + iw / 2 : PL + (i * iw) / (data.length - 1);
  const y = (v: number) => PT + ih - (v / max) * ih;
  const [hi, setHi] = useState<number | null>(null);
  const band = data.length ? iw / data.length : iw;
  const uid = useId().replace(/:/g, '');
  const areaId = `line-area-${uid}`;
  const strokeId = `line-stroke-${uid}`;

  // Highlight the peak day (first max) with a pulse marker + badge.
  const peak = data.reduce(
    (best, d, i) => (d.value > best.v ? { i, v: d.value } : best),
    { i: -1, v: 0 },
  );

  const linePts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const areaPts = data.length
    ? `${x(0)},${PT + ih} ${linePts} ${x(data.length - 1)},${PT + ih}`
    : '';

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Line chart"
        onMouseLeave={() => setHi(null)}>
        <defs>
          <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.38" />
            <stop offset="60%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="50%" stopColor={color} />
            <stop offset="100%" stopColor="#2DD4BF" />
          </linearGradient>
        </defs>

        {/* Grid lines + value axis (dashed, mono labels) */}
        {[0, 0.5, 1].map((t) => {
          const gy = PT + ih - t * ih;
          return (
            <g key={t}>
              <line x1={PL} x2={W - PR} y1={gy} y2={gy}
                stroke={t === 0 ? '#2A3C63' : '#1F2D4D'}
                strokeWidth={t === 0 ? 1.2 : 1}
                strokeDasharray={t === 0 ? undefined : '3 3'} />
              <text x={PL - 12} y={gy + 4} textAnchor="middle" fontSize="11"
                fontFamily={MONO} fill="#64748B">
                {Math.round(t * max)}
              </text>
            </g>
          );
        })}

        {/* Area + glowing trend line */}
        <polygon points={areaPts} fill={`url(#${areaId})`} />
        <polyline points={linePts} fill="none" stroke={`url(#${strokeId})`}
          strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color}99)` }} />

        {/* Data nodes + hover hit-areas */}
        {hi != null && (
          <line x1={x(hi)} x2={x(hi)} y1={PT} y2={PT + ih} stroke={color}
            strokeDasharray="3 3" opacity={0.4} />
        )}
        {data.map((d, i) => {
          const isPeak = i === peak.i && peak.v > 0;
          return (
            <g key={d.date}>
              {isPeak && (
                <circle className="thc-pulse" cx={x(i)} cy={y(d.value)} r={9}
                  fill={color} opacity={0.35} />
              )}
              <circle cx={x(i)} cy={y(d.value)} r={isPeak ? 5 : 4.5}
                fill={isPeak ? '#FFFFFF' : '#080E1B'} stroke={color}
                strokeWidth={isPeak ? 2.5 : 2} />
              <rect x={x(i) - band / 2} y={PT} width={band} height={ih} fill="transparent"
                onMouseEnter={() => setHi(i)} />
            </g>
          );
        })}

        {/* Peak badge */}
        {peak.i >= 0 && peak.v > 0 && (
          <g transform={`translate(${x(peak.i)}, ${Math.max(y(peak.v) - 26, 4)})`}>
            <rect x={-26} y={-14} width={52} height={20} rx={4}
              fill="#0C233F" stroke={color} strokeWidth={1} />
            <text x={0} y={0} textAnchor="middle" fontSize="10" fontWeight={700}
              fontFamily={MONO} fill="#38BDF8">+{peak.v} New</text>
          </g>
        )}

        {/* X axis date labels (peak highlighted) */}
        {data.map((d, i) => (
          <text key={d.date} x={x(i)} y={PT + ih + 24} textAnchor="middle" fontSize="10.5"
            fontFamily={MONO} fontWeight={i === peak.i && peak.v > 0 ? 700 : 400}
            fill={i === peak.i && peak.v > 0 ? '#38BDF8' : '#94A3B8'}>
            {fmtDate(d.date)}
          </text>
        ))}
      </svg>

      {hi != null && (
        <div style={{
          position: 'absolute', top: 0, left: `${(x(hi) / W) * 100}%`,
          transform: 'translateX(-50%)', background: 'rgba(8,14,27,0.92)', color: '#fff',
          border: `1px solid ${color}66`, padding: '4px 8px', borderRadius: 4,
          fontSize: 12, fontFamily: MONO, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {fmtDate(data[hi].date)}: <strong style={{ color }}>{data[hi].value}</strong>
        </div>
      )}
    </div>
  );
}
