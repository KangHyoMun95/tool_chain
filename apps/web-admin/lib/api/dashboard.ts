'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardResponse } from '@toolhackchain/shared';
import { apiFetch, getToken } from './client';

export const DASHBOARD_KEY = ['dashboard'] as const;

/** Role-aware dashboard metrics from GET /dashboard. */
export function useDashboard() {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: () => apiFetch<DashboardResponse>('/dashboard'),
    enabled: typeof window !== 'undefined' && !!getToken(),
    staleTime: 30_000,
  });
}
