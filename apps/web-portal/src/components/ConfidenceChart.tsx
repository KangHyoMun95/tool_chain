"use client";

import { useI18n } from "@/src/i18n/provider";
import type { ConfidencePoint } from "@/src/lib/portal-data";

const WIDTH = 600;
const HEIGHT = 224;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };
const Y_MIN = 60;
const Y_MAX = 100;
const Y_TICKS = [60, 70, 80, 90, 100];

export function ConfidenceChart({ points }: { points: ConfidencePoint[] }) {
  const { t } = useI18n();
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => PAD.top + (1 - (v - Y_MIN) / (Y_MAX - Y_MIN)) * innerH;

  // Đường cong mượt: control point nằm ở 1/3 khoảng cách ngang giữa hai điểm.
  const coords = points.map((p, i) => [x(i), y(p.value)] as const);
  const linePath = coords
    .map(([cx, cy], i) => {
      if (i === 0) return `M ${cx} ${cy}`;
      const [px, py] = coords[i - 1];
      const dx = (cx - px) / 3;
      return `C ${px + dx} ${py}, ${cx - dx} ${cy}, ${cx} ${cy}`;
    })
    .join(" ");
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1][0]} ${PAD.top + innerH} L ${coords[0][0]} ${PAD.top + innerH} Z`
    : "";

  return (
    <svg
      className="confidence-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={t("detail.chartSeries")}
    >
      {Y_TICKS.map((tick) => (
        <g key={tick}>
          <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
          <text className="chart-tick" x={PAD.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
            {tick}
          </text>
        </g>
      ))}
      <path className="chart-area" d={areaPath} />
      <path className="chart-line" d={linePath} />
      {points.map((p, i) => (
        <g key={p.sessionId}>
          <circle className="chart-point" cx={x(i)} cy={y(p.value)} r={5}>
            <title>{`#${p.sessionId}: ${p.value}%`}</title>
          </circle>
          <text className="chart-tick" x={x(i)} y={HEIGHT - 8} textAnchor="middle">
            {`#${p.sessionId}`}
          </text>
        </g>
      ))}
    </svg>
  );
}
