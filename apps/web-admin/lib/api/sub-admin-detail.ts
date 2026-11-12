'use client';

import { useQuery } from '@tanstack/react-query';
import { SUB_ADMINS_KEY } from './sub-admin';
import { apiFetch } from './client';
import { toRow, type ManagedUserRow } from './managed-users';

/** User thuộc một Admin, hiển thị chỉ xem ở trang chi tiết (dòng GET /sub-admins/:id/users). */
export type UserRow = ManagedUserRow;

/** Một lần nhận điểm (MINT / TRANSFER_IN) của user, từ GET /sub-admins/:id/point-transactions. */
export interface PointTransactionRow {
  id: string;
  /** transactions.transaction_type: MINT (HOST sinh điểm) | TRANSFER_IN (ADMIN chuyển điểm). */
  type: string;
  amount: string;
  granterId: string | null;
  granterName: string | null;
  createdAt: string;
}

interface Page<T> { items: T[]; total: number }
type UserDto = Parameters<typeof toRow>[0];
interface TransactionDto {
  transaction_id: string;
  amount: string;
  granter_id: string | null;
  granter_name: string | null;
  type: string;
  created_at: string;
}

const detailKey = (id: string) => [...SUB_ADMINS_KEY, id] as const;

/** Chi tiết một user trong cây của người đăng nhập (GET /sub-admins/:id). */
export function useSubAdmin(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: async () => toRow(await apiFetch<UserDto>(`/sub-admins/${id}`)),
    enabled: !!id,
  });
}

/** User con trực tiếp của Admin này, phân trang ở server. */
export async function fetchSubAdminUsers(id: string, page: number, limit: number): Promise<{ rows: UserRow[]; total: number }> {
  const res = await apiFetch<Page<UserDto>>(`/sub-admins/${id}/users?page=${page}&limit=${limit}`);
  return { rows: res.items.map(toRow), total: res.total };
}

/** Lịch sử điểm Admin này nhận được, phân trang ở server. */
export async function fetchPointTransactions(id: string, page: number, limit: number): Promise<{ rows: PointTransactionRow[]; total: number }> {
  const res = await apiFetch<Page<TransactionDto>>(`/sub-admins/${id}/point-transactions?page=${page}&limit=${limit}`);
  return {
    rows: res.items.map((t) => ({
      id: t.transaction_id,
      type: t.type,
      amount: t.amount,
      granterId: t.granter_id,
      granterName: t.granter_name,
      createdAt: t.created_at,
    })),
    total: res.total,
  };
}
