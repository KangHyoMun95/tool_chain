'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardDailyPoint, DashboardResponse } from '@/lib/legacy-types';
import { apiFetch, getToken } from './client';

export const DASHBOARD_KEY = ['dashboard'] as const;

/** GET /dashboard — số liệu của cây user dưới người đăng nhập (HOST / ADMIN). */
interface DashboardDto {
  total_users: number;
  active_users: number;
  inactive_7_days: number;
  total_unused_points: string;
  created_per_day: { date: string; value: number }[];
  /** CHARGE trừ REFUND mỗi ngày, bigint dạng chuỗi. */
  points_used_per_day: { date: string; value: string }[];
}

// Số điểm / ngày chỉ dùng để vẽ biểu đồ và cộng hiển thị (< 2^53); tổng điểm còn lại giữ nguyên dạng chuỗi.
const toPoints = (rows: DashboardDto['points_used_per_day']): DashboardDailyPoint[] =>
  rows.map((r) => ({ date: r.date, value: Number(r.value) }));

export function useDashboard() {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: async (): Promise<DashboardResponse> => {
      const d = await apiFetch<DashboardDto>('/dashboard');
      return {
        totalUsers: d.total_users,
        activeUsers: d.active_users,
        inactive7Days: d.inactive_7_days,
        totalUnusedPoints: d.total_unused_points,
        createdPerDay: d.created_per_day,
        pointsUsedPerDay: toPoints(d.points_used_per_day),
      };
    },
    enabled: typeof window !== 'undefined' && !!getToken(),
    staleTime: 30_000,
  });
}
