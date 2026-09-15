'use client';

import { Card, Col, Row, Skeleton, Statistic } from 'antd';
import {
  ClockCircleOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useDashboard } from '@/lib/api/dashboard';
import { MiniLineChart } from './mini-line-chart';
import { MiniBarChart } from './mini-bar-chart';

export function DashboardView() {
  const { data, isLoading } = useDashboard();
  // Display label only — the data stays role-aware on the backend (Host counts
  // its Admin(Con)s, Admin(Con) counts its Users).
  const noun = 'Người Dùng';

  const stats = [
    { title: `Tổng ${noun}`, value: data?.totalUsers, icon: <TeamOutlined /> },
    { title: `${noun} đang hoạt động`, value: data?.activeUsers, icon: <UserOutlined /> },
    {
      title: `${noun} không đăng nhập > 7 ngày`,
      value: data?.inactive7Days,
      icon: <ClockCircleOutlined />,
    },
    {
      title: `Tổng điểm chưa dùng của ${noun}`,
      value: data?.totalUnusedPoints,
      icon: <TrophyOutlined />,
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      {stats.map((s) => (
        <Col key={s.title} xs={24} sm={12} lg={6}>
          <Card>
            {isLoading ? (
              <Skeleton active paragraph={false} />
            ) : (
              <Statistic title={s.title} value={s.value ?? 0} prefix={s.icon} />
            )}
          </Card>
        </Col>
      ))}

      <Col xs={24} lg={12}>
        <Card title={`Số ${noun} tạo mới (7 ngày)`}>
          {isLoading || !data ? (
            <Skeleton active />
          ) : (
            <MiniLineChart data={data.createdPerDay} />
          )}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title="Điểm đã sử dụng (7 ngày)">
          {isLoading || !data ? (
            <Skeleton active />
          ) : (
            <MiniBarChart data={data.pointsUsedPerDay} />
          )}
        </Card>
      </Col>
    </Row>
  );
}
