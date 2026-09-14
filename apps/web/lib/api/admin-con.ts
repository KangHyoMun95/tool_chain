'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { AccountStatus, PointDirection, Role } from '@toolhackchain/shared';
import { apiFetch } from './client';

/** Query key for every Admin(Con) list/detail query. */
export const ADMIN_CONS_KEY = ['admin-cons'] as const;

/**
 * A row as returned by GET /admin-cons. `email` is optional: the backend
 * AdminCon entity does not store an email yet, so it may be undefined until
 * that column is added server-side.
 */
export interface AdminConRow {
  id: string;
  username: string;
  email?: string;
  role: Role;
  status: AccountStatus;
  points: number;
  hostId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdminConInput {
  username: string;
  password: string;
}

export interface UpdateAdminConInput {
  username?: string;
  password?: string;
}

export interface GrantPointsInput {
  amount: number;
  direction: PointDirection;
  reason?: string;
}

/** Raw fetch of all Admin(Con)s owned by the current Host (used by ProTable). */
export function fetchAdminCons(): Promise<AdminConRow[]> {
  return apiFetch<AdminConRow[]>('/admin-cons');
}

/** Fetch through the react-query cache so ProTable + hooks share one source. */
export function loadAdminCons(qc: QueryClient): Promise<AdminConRow[]> {
  return qc.fetchQuery({ queryKey: ADMIN_CONS_KEY, queryFn: fetchAdminCons });
}

export function useCreateAdminCon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminConInput) =>
      apiFetch<AdminConRow>('/admin-cons', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_CONS_KEY }),
  });
}

export function useUpdateAdminCon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAdminConInput & { id: string }) =>
      apiFetch<AdminConRow>(`/admin-cons/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_CONS_KEY }),
  });
}

export function useDeactivateAdminCon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<AdminConRow>(`/admin-cons/${id}/deactivate`, {
        method: 'PATCH',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_CONS_KEY }),
  });
}

/**
 * Grant/deduct points for an Admin(Con) via POST /admin-cons/:id/points.
 * The backend routes this through PointsService, which updates the balance and
 * writes a PointTransaction audit record in one transaction (per CLAUDE.md).
 */
export function useGrantPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: GrantPointsInput & { id: string }) =>
      apiFetch<AdminConRow>(`/admin-cons/${id}/points`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_CONS_KEY }),
  });
}
