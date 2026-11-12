import { ApiError, apiFetch } from './client';

/** Tối thiểu của mật khẩu mới (khớp ChangePasswordDto / CreateUserDto ở API). */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Tự đổi mật khẩu: POST /auth/change-password. Phiên hiện tại giữ nguyên, các phiên khác (thiết bị khác) bị đăng xuất.
 * 400 là lỗi nghiệp vụ (sai mật khẩu cũ / mới trùng cũ), được dịch sang tiếng Việt; không dùng 401 nên không bị đẩy về /login.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  try {
    await apiFetch<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 429) throw new Error('Thao tác quá nhanh. Vui lòng thử lại sau ít phút.');
      if (err.status === 400 && /incorrect/i.test(err.message)) throw new Error('Mật khẩu cũ không đúng.');
      if (err.status === 400 && /different/i.test(err.message)) throw new Error('Mật khẩu mới phải khác mật khẩu cũ.');
    }
    throw err;
  }
}
