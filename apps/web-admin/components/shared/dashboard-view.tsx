'use client';

import { Col, Row, Skeleton } from 'antd';
import {
  ClockCircleOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { useDashboard } from '@/lib/api/dashboard';
import { MiniLineChart } from './mini-line-chart';
import { MiniBarChart } from './mini-bar-chart';

/** Monospace stack for numeric/telemetry readouts (see WEB-ADMIN.DESIGN.md). */
const MONO =
  "ui-monospace, 'JetBrains Mono', 'Space Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

/** Per-metric accent, following the Stitch "Redesigned Dashboard" mapping. */
type Accent = { color: string; chipBg: string; glow: string };
const ACCENTS: Record<'cyan' | 'teal' | 'amber' | 'purple', Accent> = {
  cyan: { color: '#22D3EE', chipBg: 'rgba(34,211,238,0.12)', glow: 'rgba(34,211,238,0.16)' },
  teal: { color: '#2DD4BF', chipBg: 'rgba(45,212,191,0.12)', glow: 'rgba(45,212,191,0.16)' },
  amber: { color: '#F59E0B', chipBg: 'rgba(245,158,11,0.12)', glow: 'rgba(245,158,11,0.16)' },
  purple: { color: '#A855F7', chipBg: 'rgba(168,85,247,0.12)', glow: 'rgba(168,85,247,0.16)' },
};

/**
 * Scoped styling for the glass KPI cards + chart peak-marker pulse. Kept local
 * to the dashboard so it does not leak into the rest of the admin chrome.
 */
const dashCss = `
  .thc-card {
    position: relative;
    overflow: hidden;
    border-radius: 16px;
    padding: 20px;
    height: 100%;
    background: linear-gradient(180deg, rgba(19,29,54,0.85) 0%, rgba(13,20,39,0.95) 100%);
    border: 1px solid rgba(255,255,255,0.07);
    transition: transform .3s ease, border-color .3s ease;
  }
  .thc-card:hover { transform: translateY(-4px); }
  .thc-card__blob {
    position: absolute; right: -24px; bottom: -24px;
    width: 96px; height: 96px; border-radius: 9999px;
    filter: blur(28px); pointer-events: none;
  }
  .thc-chart-card {
    border-radius: 16px; padding: 24px; height: 100%;
    background: linear-gradient(180deg, rgba(19,29,54,0.85) 0%, rgba(13,20,39,0.95) 100%);
    border: 1px solid rgba(255,255,255,0.07);
  }
  @keyframes thcPulse {
    0%,100% { transform: scale(1); opacity: .85; }
    50% { transform: scale(1.35); opacity: 1; }
  }
  .thc-pulse { animation: thcPulse 2s ease-in-out infinite; transform-origin: center; }
`;

function KpiCard({
  label,
  value,
  icon,
  accent,
  badge,
  caption,
  loading,
}: {
  label: string;
  value?: number;
  icon: ReactNode;
  accent: Accent;
  badge?: ReactNode;
  caption: string;
  loading: boolean;
}) {
  return (
    <div className="thc-card" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
      <span className="thc-card__blob" style={{ background: accent.glow }} />
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#9CA3AF',
            }}
          >
            <span>{label}</span>
            <span
              style={{
                display: 'inline-flex',
                padding: 6,
                borderRadius: 8,
                background: accent.chipBg,
                color: accent.color,
                fontSize: 16,
              }}
            >
              {icon}
            </span>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
              }}
            >
              {(value ?? 0).toLocaleString('vi-VN')}
            </span>
            {badge}
          </div>

          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid #1E2C4D',
              fontSize: 12,
              color: accent.color,
              fontWeight: 500,
            }}
          >
            {caption}
          </div>
        </>
      )}
    </div>
  );
}

/** Small pill badge used both on KPI cards and chart headers. */
function Pill({ accent, children }: { accent: Accent; children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 12,
        fontWeight: 600,
        padding: '2px 10px',
        borderRadius: 6,
        background: accent.chipBg,
        color: accent.color,
        border: `1px solid ${accent.color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function ChartCard({
  title,
  subtitle,
  badge,
  footLeft,
  footRight,
  children,
}: {
  title: string;
  subtitle: string;
  badge: ReactNode;
  footLeft: ReactNode;
  footRight: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="thc-chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>{title}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9CA3AF' }}>{subtitle}</p>
        </div>
        {badge}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid #1A2744',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#9CA3AF',
        }}
      >
        {footLeft}
        {footRight}
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function DashboardView() {
  const { data, isLoading } = useDashboard();
  // Display label only — the data stays role-aware on the backend (Host counts
  // its Admin(Con)s, Admin(Con) counts its Users).
  const noun = 'Người Dùng';

  const total = data?.totalUsers ?? 0;
  const active = data?.activeUsers ?? 0;
  const activePct = total > 0 ? Math.round((active / total) * 100) : 0;

  // Chart-derived, real-data annotations.
  const created = data?.createdPerDay ?? [];
  const used = data?.pointsUsedPerDay ?? [];
  const peakCreated = created.reduce(
    (best, p) => (p.value > best.value ? p : best),
    { date: '', value: 0 },
  );
  const usedTotal = used.reduce((s, p) => s + p.value, 0);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: dashCss }} />
      <Row gutter={[20, 20]}>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            label={`Tổng ${noun}`}
            value={data?.totalUsers}
            icon={<TeamOutlined />}
            accent={ACCENTS.cyan}
            caption="Toàn hệ thống ToolHackChain"
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            label={`${noun} đang hoạt động`}
            value={data?.activeUsers}
            icon={<UserOutlined />}
            accent={ACCENTS.teal}
            badge={<Pill accent={ACCENTS.teal}>{activePct}% tổng số</Pill>}
            caption="Phiên tương tác trực tuyến"
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            label={`${noun} không đăng nhập > 7 ngày`}
            value={data?.inactive7Days}
            icon={<ClockCircleOutlined />}
            accent={ACCENTS.amber}
            caption="Nguy cơ rời bỏ dịch vụ"
            loading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            label={`Tổng điểm chưa dùng của ${noun}`}
            value={data?.totalUnusedPoints}
            icon={<TrophyOutlined />}
            accent={ACCENTS.purple}
            badge={<Pill accent={ACCENTS.purple}>pts</Pill>}
            caption="Điểm khả dụng của người dùng"
            loading={isLoading}
          />
        </Col>

        <Col xs={24} lg={12}>
          <ChartCard
            title={`Số ${noun} tạo mới (7 ngày)`}
            subtitle="Biểu đồ dao động lượng tài khoản đăng ký mới"
            badge={<Pill accent={ACCENTS.cyan}>Đỉnh: +{peakCreated.value}</Pill>}
            footLeft={
              <span>
                Tăng đột biến vào:{' '}
                <strong style={{ color: ACCENTS.cyan.color }}>
                  {peakCreated.date ? fmtDate(peakCreated.date) : '—'}
                </strong>
              </span>
            }
            footRight={<span style={{ color: '#10B981' }}>Đã đồng bộ</span>}
          >
            {isLoading || !data ? (
              <Skeleton active />
            ) : (
              <MiniLineChart data={data.createdPerDay} />
            )}
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard
            title="Điểm đã sử dụng (7 ngày)"
            subtitle="Quy đổi điểm thưởng và giao dịch sử dụng"
            badge={<Pill accent={ACCENTS.purple}>Tổng dùng: {usedTotal} pts</Pill>}
            footLeft={<span>Chi tiêu điểm theo ngày</span>}
            footRight={<span style={{ color: ACCENTS.purple.color }}>Đã kiểm toán</span>}
          >
            {isLoading || !data ? (
              <Skeleton active />
            ) : (
              <MiniBarChart data={data.pointsUsedPerDay} />
            )}
          </ChartCard>
        </Col>
      </Row>
    </>
  );
}
