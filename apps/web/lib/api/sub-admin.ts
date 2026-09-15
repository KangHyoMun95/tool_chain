'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { AccountStatus, PointDirection, Role } from '@toolhackchain/shared';
import { apiFetch } from './client';

/** Query key for every Admin(Con) list/detail query. */
export const SUB_ADMINS_KEY = ['sub-admins'] as const;

/**
 * A row as returned by GET /sub-admins. `email` is optional: the backend
 * SubAdmin entity does not store an email yet, so it may be undefined until
 * that column is added server-side.
 */
export interface SubAdminRow {
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

export interface CreateSubAdminInput {
  username: string;
  password: string;
}

export interface UpdateSubAdminInput {
  username?: string;
  password?: string;
}

export interface GrantPointsInput {
  amount: number;
  direction: PointDirection;
  reason?: string;
}

/** Raw fetch of all Admin(Con)s owned by the current Host (used by ProTable). */
export function fetchSubAdmins(): Promise<SubAdminRow[]> {
  return apiFetch<SubAdminRow[]>('/sub-admins');
}

/** Fetch through the react-query cache so ProTable + hooks share one source. */
export function loadSubAdmins(qc: QueryClient): Promise<SubAdminRow[]> {
  return qc.fetchQuery({ queryKey: SUB_ADMINS_KEY, queryFn: fetchSubAdmins });
}

export function useCreateSubAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubAdminInput) =>
      apiFetch<SubAdminRow>('/sub-admins', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUB_ADMINS_KEY }),
  });
}

export function useUpdateSubAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSubAdminInput & { id: string }) =>
      apiFetch<SubAdminRow>(`/sub-admins/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUB_ADMINS_KEY }),
  });
}

export function useDeactivateSubAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<SubAdminRow>(`/sub-admins/${id}/deactivate`, {
        method: 'PATCH',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUB_ADMINS_KEY }),
  });
}

/**
 * Grant/deduct points for an Admin(Con) via POST /sub-admins/:id/points.
 * The backend routes this through PointsService, which updates the balance and
 * writes a PointTransaction audit record in one transaction (per CLAUDE.md).
 */
export function useGrantPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: GrantPointsInput & { id: string }) =>
      apiFetch<SubAdminRow>(`/sub-admins/${id}/points`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUB_ADMINS_KEY }),
  });
}
