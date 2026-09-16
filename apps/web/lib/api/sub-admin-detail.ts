'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { AccountStatus, PointTargetType, Role } from '@toolhackchain/shared';
import { apiFetch } from './client';
import { SUB_ADMINS_KEY, type SubAdminRow } from './sub-admin';

/** A User row as shown read-only on the Host's Sub-Admin detail page. */
export interface UserRow {
  id: string;
  username: string;
  phoneNumber?: string | null;
  hostnames: { id: string; name: string; url: string }[];
  role: Role;
  status: AccountStatus;
  points: number;
  managedBySubAdminId: string;
  createdAt: string;
  updatedAt: string;
}

/** A points transaction row (from PointTransaction). */
export interface PointTransactionRow {
  id: string;
  fromAdminId: string;
  toEntityType: PointTargetType;
  toEntityId: string;
  /** Signed: positive = credit, negative = debit. */
  amount: number;
  reason: string | null;
  createdAt: string;
}

const detailKey = (id: string) => [...SUB_ADMINS_KEY, id] as const;
const usersKey = (id: string) => [...SUB_ADMINS_KEY, id, 'users'] as const;
const txKey = (id: string) => [...SUB_ADMINS_KEY, id, 'point-transactions'] as const;

/** Sub-Admin detail (GET /sub-admins/:id). */
export function useSubAdmin(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => apiFetch<SubAdminRow>(`/sub-admins/${id}`),
    enabled: !!id,
  });
}

/** Read-only list of the Users managed by this Sub-Admin (Host view). */
export async function loadSubAdminUsers(
  qc: QueryClient,
  id: string,
): Promise<UserRow[]> {
  try {
    return await qc.fetchQuery({
      queryKey: usersKey(id),
      queryFn: () => apiFetch<UserRow[]>(`/sub-admins/${id}/users`),
    });
  } catch {
    return [];
  }
}

/** Read-only points-transaction history for this Sub-Admin. */
export async function loadPointTransactions(
  qc: QueryClient,
  id: string,
): Promise<PointTransactionRow[]> {
  try {
    return await qc.fetchQuery({
      queryKey: txKey(id),
      queryFn: () =>
        apiFetch<PointTransactionRow[]>(`/sub-admins/${id}/point-transactions`),
    });
  } catch {
    return [];
  }
}
