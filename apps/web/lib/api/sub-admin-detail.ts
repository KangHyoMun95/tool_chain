'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  AccountStatus,
  PointTargetType,
  Role,
} from '@toolhackchain/shared';
import { apiFetch } from './client';
import { SUB_ADMINS_KEY, type SubAdminRow } from './sub-admin';

/** A User row as shown read-only on the Host's Sub-Admin detail page. */
export interface UserRow {
  id: string;
  username: string;
  phoneNumber?: string | null;
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

/** Homepage config owned by the Host for this Sub-Admin (open JSON content). */
export interface HomepageConfigData {
  id?: string;
  subAdminId: string;
  content: Record<string, unknown>;
  updatedAt?: string;
}

const detailKey = (id: string) => [...SUB_ADMINS_KEY, id] as const;
const usersKey = (id: string) => [...SUB_ADMINS_KEY, id, 'users'] as const;
const txKey = (id: string) => [...SUB_ADMINS_KEY, id, 'point-transactions'] as const;
const homepageKey = (id: string) => [...SUB_ADMINS_KEY, id, 'homepage-config'] as const;

/** Sub-Admin detail (GET /sub-admins/:id — implemented). */
export function useSubAdmin(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => apiFetch<SubAdminRow>(`/sub-admins/${id}`),
    enabled: !!id,
  });
}

/**
 * Load helpers used by the read-only ProTables. They swallow errors and return
 * [] so the page still renders while the backend endpoints are being built
 * (GET /sub-admins/:id/users and /point-transactions do not exist yet).
 */
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

/** Homepage config for this Sub-Admin (Host only). GET may 404 until built. */
export function useHomepageConfig(id: string) {
  return useQuery({
    queryKey: homepageKey(id),
    enabled: !!id,
    queryFn: async (): Promise<HomepageConfigData> => {
      try {
        return await apiFetch<HomepageConfigData>(
          `/sub-admins/${id}/homepage-config`,
        );
      } catch {
        // Not configured yet (or endpoint missing) — start from empty.
        return { subAdminId: id, content: {} };
      }
    },
  });
}

/** Save homepage config (Host only) — PUT /sub-admins/:id/homepage-config. */
export function useSaveHomepageConfig(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: Record<string, unknown>) =>
      apiFetch<HomepageConfigData>(`/sub-admins/${id}/homepage-config`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: homepageKey(id) }),
  });
}
