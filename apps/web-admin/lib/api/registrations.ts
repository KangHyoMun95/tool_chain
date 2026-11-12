import { apiFetch } from './client';

/** Số điện thoại đã đăng ký từ portal, chờ HOST cấp tài khoản (GET /users-register). */
export interface RegistrationRow {
  id: string;
  phoneNumber: string;
  /** null = dòng đăng ký cũ, không biết ngày. */
  createdAt: string | null;
}

export interface AdminOption {
  value: string;
  label: string;
}

interface RegistrationDto {
  user_register_id: string;
  phone_number: string;
  created_at: string | null;
}

export async function fetchRegistrations(page: number, limit: number): Promise<{ rows: RegistrationRow[]; total: number }> {
  const res = await apiFetch<{ items: RegistrationDto[]; total: number }>(`/users-register?page=${page}&limit=${limit}`);
  return {
    rows: res.items.map((r) => ({ id: r.user_register_id, phoneNumber: r.phone_number, createdAt: r.created_at })),
    total: res.total,
  };
}

/** Admin ACTIVE là con trực tiếp của HOST, cho dropdown "Admin quản lý". */
export async function fetchAdminOptions(): Promise<AdminOption[]> {
  const res = await apiFetch<{ user_id: string; phone_number: string; display_name: string | null }[]>('/users-register/admins');
  return res.map((a) => ({ value: a.user_id, label: a.display_name ? `${a.display_name} (${a.phone_number})` : a.phone_number }));
}

export interface ActivateRegistrationInput {
  admin_id: string;
  password: string;
  display_name?: string;
}

export function activateRegistration(id: string, input: ActivateRegistrationInput) {
  return apiFetch<{ user_id: string }>(`/users-register/${id}/activate`, { method: 'POST', body: JSON.stringify(input) });
}
