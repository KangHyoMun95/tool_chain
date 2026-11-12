'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { AccountStatus } from '@/lib/legacy-types';
import type { Role } from '@/lib/auth/roles';
import { apiFetch } from './client';
import { setUserStatus } from './user';

export const SUB_ADMINS_KEY = ['sub-admins'] as const;

export interface SubAdminRow {
  id: string;
  username: string;
  phoneNumber?: string | null;
  displayName?: string | null;
  role: Role;
  status: AccountStatus;
  points: string | number;
  hostId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubAdminInput {
  display_name?: string;
  phone_number: string;
  password: string;
}

export interface UpdateSubAdminInput {
  displayName?: string | null;
  password?: string;
  phoneNumber?: string;
}

export interface GrantPointsInput {
  amount: number;
  /** Nguyên nhân cấp điểm, tùy chọn (API: 1–200 ký tự). */
  reason?: string;
}

export function fetchSubAdmins(): Promise<SubAdminRow[]> {
  return apiFetch<SubAdminRow[]>('/sub-admins');
}

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
    mutationFn: ({ id, password, phoneNumber, displayName }: UpdateSubAdminInput & { id: string }) =>
      apiFetch<{ user_id: string }>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: password || undefined, phone_number: phoneNumber || undefined, display_name: displayName }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUB_ADMINS_KEY }),
  });
}

export function useDeactivateSubAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      setUserStatus(id, 'DEACTIVE'),
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
