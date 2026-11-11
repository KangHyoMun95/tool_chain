'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { AccountStatus } from '@/lib/legacy-types';
import type { Role } from '@/lib/auth/roles';
import { apiFetch } from './client';

/** Query key for every Admin(Con) list/detail query. */
export const SUB_ADMINS_KEY = ['sub-admins'] as const;

/**
/** A row as returned by GET /sub-admins. */
export interface SubAdminRow {
  id: string;
  username: string;
  phoneNumber?: string | null;
  role: Role;
  status: AccountStatus;
  points: string | number;
  hostId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubAdminInput {
  phone_number: string;
  password: string;
}

export interface UpdateSubAdminInput {
  password?: string;
  phoneNumber?: string;
}

export interface GrantPointsInput {
  amount: number;
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
      apiFetch<{ user_id: string }>('/users', {
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
 * Cấp điểm cho cấp dưới trực tiếp: POST /users/:id/points `{ amount }` (API từ chối cháu / cha).
 */
export function useGrantPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: GrantPointsInput & { id: string }) =>
      apiFetch<SubAdminRow>(`/users/${id}/points`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUB_ADMINS_KEY }),
  });
}
