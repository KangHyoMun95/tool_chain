import { AccountStatus } from '@/lib/legacy-types';
import type { SubAdminRow } from './sub-admin';
import type { UserRow } from './user';
import { apiFetch } from './client';

interface ManagedUserDto {
  user_id: string;
  phone_number: string;
  display_name: string | null;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'DEACTIVE' | 'DELETED';
  balance: string;
  refer_user_id: string;
  depth: number;
  created_at: string;
  children?: ManagedUserDto[];
}

interface ManagedUserPage {
  items: ManagedUserDto[];
  total: number;
  page: number;
  limit: number;
}

/** Một dòng của GET /sub-admins, đủ trường để các modal sửa / cấp điểm cũ dùng được. */
export type ManagedUserRow = UserRow & SubAdminRow & { depth: number; deleted: boolean; children?: ManagedUserRow[] };

export interface ManagedUserQuery {
  page: number;
  limit: number;
  q?: string;
  status?: AccountStatus;
  role?: 'ADMIN' | 'USER';
}

export const toRow = (u: ManagedUserDto): ManagedUserRow => ({
  id: u.user_id,
  username: u.phone_number,
  phoneNumber: u.phone_number,
  displayName: u.display_name ?? null,
  role: u.role,
  status: u.status === 'ACTIVE' ? AccountStatus.ACTIVE : AccountStatus.INACTIVE,
  points: u.balance,
  hostId: u.refer_user_id,
  managedBySubAdminId: u.refer_user_id,
  hostnames: [],
  depth: u.depth,
  deleted: u.status === 'DELETED',
  createdAt: u.created_at,
  updatedAt: u.created_at,
  ...(u.children?.length ? { children: u.children.map(toRow) } : {}),
});

/** Cây user dưới người đăng nhập: con trực tiếp ở gốc (phân trang ở server), con cháu nằm trong `children`. */
export async function fetchManagedUsers(query: ManagedUserQuery): Promise<{ rows: ManagedUserRow[]; total: number }> {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  if (query.q) params.set('q', query.q);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status === AccountStatus.ACTIVE ? 'ACTIVE' : 'DEACTIVE');
  const res = await apiFetch<ManagedUserPage>(`/sub-admins?${params}`);
  return { rows: res.items.map(toRow), total: res.total };
}

/** Tham số tìm kiếm của ProTable → query API (ô tìm kiếm khớp số điện thoại hoặc tên hiển thị). */
export function toManagedUserQuery(params: {
  current?: number;
  pageSize?: number;
  phoneNumber?: string;
  status?: string;
  role?: string;
}): ManagedUserQuery {
  const q = (params.phoneNumber ?? '').trim();   // khớp số điện thoại hoặc tên hiển thị
  return {
    page: params.current ?? 1,
    limit: params.pageSize ?? 10,
    q: q || undefined,
    status: params.status === AccountStatus.ACTIVE || params.status === AccountStatus.INACTIVE ? params.status : undefined,
    role: params.role === 'ADMIN' || params.role === 'USER' ? params.role : undefined,
  };
}
