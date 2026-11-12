'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { AccountStatus } from '@/lib/legacy-types';
import type { Role } from '@/lib/auth/roles';
import { apiFetch } from './client';
import { ME_KEY } from './profile';

export const USERS_KEY = ['users'] as const;

export interface UserRow {
  id: string;
  username: string;
  phoneNumber?: string | null;
  displayName?: string | null;
  role: Role;
  status: AccountStatus;
  points: string | number;
  managedBySubAdminId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  display_name?: string;
  phone_number: string;
  password: string;
}

export interface UpdateUserInput {
  /** Chuỗi = đặt tên, null = xóa tên, bỏ trống = không đổi. */
  displayName?: string | null;
  password?: string;
  phoneNumber?: string;
}

export interface GrantUserPointsInput {
  amount: number;
}

export function fetchUsers(): Promise<UserRow[]> {
  return apiFetch<UserRow[]>('/users');
}

export function loadUsers(qc: QueryClient): Promise<UserRow[]> {
  return qc.fetchQuery({ queryKey: USERS_KEY, queryFn: fetchUsers });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const created = await apiFetch<{ user_id: string }>('/users', { method: 'POST', body: JSON.stringify(input) });
      return { id: created.user_id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password, phoneNumber, displayName }: UpdateUserInput & { id: string }) =>
      apiFetch<{ user_id: string }>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: password || undefined, phone_number: phoneNumber || undefined, display_name: displayName }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

/** PATCH /users/:id/status — API chỉ cho cha đổi status của con trực tiếp. */
export function setUserStatus(id: string, status: 'ACTIVE' | 'DEACTIVE' | 'DELETED', transferToAdminId?: string) {
  return apiFetch<{ user_id: string; status: string; returned_points?: string }>(`/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(transferToAdminId ? { transfer_to_admin_id: transferToAdminId } : {}) }),
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setUserStatus(id, 'ACTIVE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

/**
 * Xóa mềm (status DELETED): con trực tiếp đã deactive. Điểm còn lại thu hồi về người xóa (INVOKE). HOST xóa ADMIN phải truyền
 * `transferToAdminId` (Admin nhận bàn giao cấp dưới).
 */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, transferToAdminId }: { id: string; transferToAdminId?: string }) =>
      setUserStatus(id, 'DELETED', transferToAdminId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      qc.invalidateQueries({ queryKey: ME_KEY });   // điểm của user bị xóa chuyển về số dư của người xóa
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      setUserStatus(id, 'DEACTIVE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useGrantUserPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: GrantUserPointsInput & { id: string }) =>
      apiFetch<UserRow>(`/users/${id}/points`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      // Refresh the user list AND the header balance (points were deducted
      // from the Admin(Con) that funded the grant).
      qc.invalidateQueries({ queryKey: USERS_KEY });
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

