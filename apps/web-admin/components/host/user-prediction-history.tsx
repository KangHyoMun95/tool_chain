'use client';

import { useMemo, useState } from 'react';
import { ProCard, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, DatePicker, Flex, InputNumber, Select, Space, Statistic, Tag, Typography } from 'antd';
import {
  fetchPredictionHistory,
  usePredictionFilterOptions,
  type PredictionHistoryFilter,
  type PredictionHistoryRow,
  type PredictionHistoryStats,
  type PredictionOutcome,
} from '@/lib/api/user-prediction-history';

const OUTCOME_TAG: Record<PredictionOutcome, { color: string; text: string }> = {
  WIN: { color: 'green', text: 'Thắng' },
  LOSE: { color: 'red', text: 'Thua' },
  DRAW: { color: 'default', text: 'Hòa' },
};

const EMPTY_STATS: PredictionHistoryStats = { totalWin: 0, totalLose: 0, totalDraw: 0, winRate: null };

/** Lịch sử dự đoán của một USER (chỉ xem): bộ lọc, thống kê theo bộ lọc, bảng phân trang ở server. */
export function UserPredictionHistory({ userId }: { userId: string }) {
  const { data: options } = usePredictionFilterOptions(userId, true);
    // `draft` là giá trị đang chọn; `applied` chỉ đổi khi bấm Lọc để không gọi API theo từng phím gõ.
  const [draft, setDraft] = useState<PredictionHistoryFilter>({});
  const [applied, setApplied] = useState<PredictionHistoryFilter>({});
  const [resetKey, setResetKey] = useState(0);   // đổi key để RangePicker (không điều khiển) về trống
  const [stats, setStats] = useState<PredictionHistoryStats>(EMPTY_STATS);

  const categories = useMemo(
    () => (options?.categories ?? []).filter((c) => !draft.lobbyId || c.lobbyId === draft.lobbyId),
    [options, draft.lobbyId],
  );
  const streams = useMemo(
    () => (options?.streams ?? []).filter((s) => (draft.categoryId ? s.categoryId === draft.categoryId : categories.some((c) => c.id === s.categoryId))),
    [options, draft.categoryId, categories],
  );

  const apply = (f: PredictionHistoryFilter) => {
    setApplied(f);   // `params` của ProTable đổi ⇒ tự về trang 1 và gọi lại request
  };

  const columns: ProColumns<PredictionHistoryRow>[] = [
    { title: 'Thời gian', dataIndex: 'time', valueType: 'dateTime', width: 180 },
    { title: 'Tên sảnh', dataIndex: 'lobbyName', ellipsis: true },
    { title: 'Tên game', dataIndex: 'categoryName', ellipsis: true },
    { title: 'Tên bàn', dataIndex: 'streamName', ellipsis: true },
    { title: 'Số phiên', dataIndex: 'gameShoe', width: 100 },
    { title: 'Số ván', dataIndex: 'gameRound', width: 100 },
    {
      title: 'Kết quả',
      dataIndex: 'outcome',
      width: 100,
      render: (_d, r) => <Tag color={OUTCOME_TAG[r.outcome].color}>{OUTCOME_TAG[r.outcome].text}</Tag>,
    },
  ];

  return (
    <ProCard title="Lịch sử dự đoán" bordered headerBordered style={{ marginTop: 16 }}>
      <Flex wrap gap={8} style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker
          key={resetKey}
          showTime
          onChange={(v) => setDraft((d) => ({ ...d, from: v?.[0]?.toISOString(), to: v?.[1]?.toISOString() }))}
        />
        <Select
          allowClear placeholder="Sảnh" style={{ width: 160 }} value={draft.lobbyId}
          options={(options?.lobbies ?? []).map((l) => ({ value: l.id, label: l.name }))}
          onChange={(v) => setDraft((d) => ({ ...d, lobbyId: v, categoryId: undefined, streamId: undefined }))}
        />
        <Select
          allowClear placeholder="Game" style={{ width: 160 }} value={draft.categoryId}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => setDraft((d) => ({ ...d, categoryId: v, streamId: undefined }))}
        />
        <Select
          allowClear placeholder="Bàn" style={{ width: 160 }} value={draft.streamId}
          options={streams.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => setDraft((d) => ({ ...d, streamId: v }))}
        />
        <InputNumber
          min={0} precision={0} placeholder="Số phiên" style={{ width: 110 }} value={draft.gameShoe}
          onChange={(v) => setDraft((d) => ({ ...d, gameShoe: v ?? undefined }))}
        />
        <InputNumber
          min={0} precision={0} placeholder="Số ván" style={{ width: 110 }} value={draft.gameRound}
          onChange={(v) => setDraft((d) => ({ ...d, gameRound: v ?? undefined }))}
        />
        <Space>
          <Button type="primary" onClick={() => apply(draft)}>Lọc</Button>
          <Button onClick={() => { setDraft({}); setResetKey((k) => k + 1); apply({}); }}>Xóa lọc</Button>
        </Space>
      </Flex>

      <Flex wrap gap={32} style={{ marginBottom: 16 }}>
        <Statistic title="Tổng thắng" value={stats.totalWin} valueStyle={{ color: '#52c41a' }} />
        <Statistic title="Tổng thua" value={stats.totalLose} valueStyle={{ color: '#ff4d4f' }} />
        <Statistic title="Tổng hòa" value={stats.totalDraw} />
        <Statistic
          title="Tỉ lệ thắng (không tính hòa)"
          value={stats.winRate === null ? '—' : (stats.winRate * 100).toFixed(1)}
          suffix={stats.winRate === null ? undefined : '%'}
        />
      </Flex>

      <ProTable<PredictionHistoryRow>
        rowKey="key"
        search={false}
        options={false}
        columns={columns}
        pagination={{ pageSize: 10 }}
        params={applied}
        request={async (params) => {
          try {
            const { rows, total, stats: s } = await fetchPredictionHistory(userId, params.current ?? 1, params.pageSize ?? 10, applied);
            setStats(s);
            return { data: rows, total, success: true };
          } catch {
            setStats(EMPTY_STATS);
            return { data: [], total: 0, success: false };
          }
        }}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Dữ liệu chi tiết chỉ được lưu theo thời hạn của job CLEAR_HISTORY.
      </Typography.Text>
    </ProCard>
  );
}
