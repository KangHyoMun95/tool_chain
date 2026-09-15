'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { AccountStatus, PointDirection, Role } from '@toolhackchain/shared';
import { apiFetch } from './client';
import { ME_KEY } from './profile';

/**
 * Query key for the current Admin(Con)'s users. The backend scopes GET /users
 * to the logged-in Admin(Con) (managed_by_admin_con_id), so the frontend just
 * calls the endpoint — no adminConId is passed from the client.
 */
export const USERS_KEY = ['users'] as const;

export interface UserRow {
  id: string;
  username: string;
  email?: string;
  role: Role;
  status: AccountStatus;
  points: number;
  managedBySubAdminId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
}

export interface UpdateUserInput {
  username?: string;
  password?: string;
}

export interface GrantUserPointsInput {
  amount: number;
  direction: PointDirection;
  reason?: string;
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
    mutationFn: (input: CreateUserInput) =>
      apiFetch<UserRow>('/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: string }) =>
      apiFetch<UserRow>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

/** Hard delete — Admin(Con) may delete its own Users (see CLAUDE.md). */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<UserRow>(`/users/${id}/deactivate`, { method: 'PATCH' }),
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
