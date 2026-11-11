'use client';

import { useMutation } from '@tanstack/react-query';
import type { UserStatus } from '@toolhackchain/shared';
import type { Role } from '../auth/roles';
import { apiFetch } from './client';

/** POST /users: HOST tạo ADMIN, ADMIN tạo USER (role và cấp trên do server suy ra từ người gọi). */
export interface CreateAccountInput {
  phone_number: string;
  /** Tối thiểu 12 ký tự. */
  password: string;
}

export interface CreatedAccount {
  user_id: string;
  phone_number: string;
  role: Role;
  status: UserStatus;
  refer_user_id: string;
}

export function useCreateAccount() {
  return useMutation({
    mutationFn: (input: CreateAccountInput) =>
      apiFetch<CreatedAccount>('/users', { method: 'POST', body: JSON.stringify(input) }),
  });
}

/** PATCH /users/:id/status. Chỉ cấp trên trực tiếp được đổi; xóa mềm (DELETED) chỉ ADMIN. */
export function useUpdateAccountStatus() {
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: UserStatus }) =>
      apiFetch<{ user_id: string; status: UserStatus }>(`/users/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
  });
}
