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
 * Neon single-series bars over 7 days (Stitch "Redesigned Dashboard" look):
 * violet gradient bars with glow, peak column highlight + value badge, mono axes.
 */
export function MiniBarChart({
  data,
  color = '#A855F7',
}: {
  data: DashboardDailyPoint[];
  color?: string;
}) {
  const W = 600, H = 280, PL = 45, PR = 25, PT = 24, PB = 70;
  const iw = W - PL - PR, ih = H - PT - PB;
  const max = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const band = data.length ? iw / data.length : iw;
  const barW = Math.min(28, band - 14);
  const y = (v: number) => PT + ih - (v / max) * ih;
  const [hi, setHi] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  const barId = `bar-grad-${uid}`;
  const glowId = `bar-glow-${uid}`;

  const peak = data.reduce(
    (best, d, i) => (d.value > best.v ? { i, v: d.value } : best),
    { i: -1, v: 0 },
  );

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bar chart"
        onMouseLeave={() => setHi(null)}>
        <defs>
          <linearGradient id={barId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#9333EA" />
            <stop offset="70%" stopColor="#7E22CE" />
            <stop offset="100%" stopColor="#581C87" />
          </linearGradient>
          <linearGradient id={glowId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(168,85,247,0.4)" />
            <stop offset="100%" stopColor="rgba(147,51,234,0)" />
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

        {data.map((d, i) => {
          const cx = PL + band * i + band / 2;
          const h = ih - (y(d.value) - PT);
          const isPeak = i === peak.i && peak.v > 0;
          const dim = hi !== null && hi !== i;
          return (
            <g key={d.date} onMouseEnter={() => setHi(i)}>
              {isPeak && (
                <rect x={cx - (barW + 12) / 2} y={PT} width={barW + 12} height={ih}
                  rx={6} fill={`url(#${glowId})`} />
              )}
              {d.value > 0 ? (
                <rect x={cx - barW / 2} y={y(d.value)} width={barW} height={Math.max(0, h)}
                  rx={4} fill={`url(#${barId})`} stroke={color} strokeWidth={isPeak ? 1 : 0}
                  opacity={dim ? 0.55 : 1}
                  style={isPeak ? { filter: `drop-shadow(0 0 10px ${color}73)` } : undefined} />
              ) : (
                <rect x={cx - 8} y={PT + ih - 2} width={16} height={2} rx={1} fill="#1E2C4D" />
              )}
              <rect x={cx - band / 2} y={PT} width={band} height={ih} fill="transparent" />
            </g>
          );
        })}

        {/* Peak value badge */}
        {peak.i >= 0 && peak.v > 0 && (
          <g transform={`translate(${PL + band * peak.i + band / 2}, ${Math.max(y(peak.v) - 16, 6)})`}>
            <rect x={-18} y={-12} width={36} height={18} rx={4}
              fill="#3B0764" stroke={color} strokeWidth={1} />
            <text x={0} y={1} textAnchor="middle" fontSize="10" fontWeight={700}
              fontFamily={MONO} fill="#E9D5FF">{peak.v}</text>
          </g>
        )}

        {/* X axis date labels (peak highlighted) */}
        {data.map((d, i) => (
          <text key={d.date} x={PL + band * i + band / 2} y={PT + ih + 24}
            textAnchor="middle" fontSize="10.5" fontFamily={MONO}
            fontWeight={i === peak.i && peak.v > 0 ? 700 : 400}
            fill={i === peak.i && peak.v > 0 ? '#C084FC' : '#94A3B8'}>
            {fmtDate(d.date)}
          </text>
        ))}
      </svg>

      {hi != null && (
        <div style={{
          position: 'absolute', top: 0,
          left: `${((PL + band * hi + band / 2) / W) * 100}%`,
          transform: 'translateX(-50%)', background: 'rgba(8,14,27,0.92)', color: '#fff',
          border: `1px solid ${color}66`, padding: '4px 8px', borderRadius: 4,
          fontSize: 12, fontFamily: MONO, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {fmtDate(data[hi].date)}: <strong style={{ color: '#C084FC' }}>{data[hi].value}</strong>
        </div>
      )}
    </div>
  );
}
