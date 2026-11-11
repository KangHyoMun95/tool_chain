'use client';

import { useMutation } from '@tanstack/react-query';
import { login, type SessionUser } from './client';

export interface LoginInput {
  phone_number: string;
  password: string;
}

/** Đăng nhập: access token nằm trong bộ nhớ, refresh token là cookie httpOnly do API đặt. */
export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput): Promise<SessionUser> => login(input.phone_number, input.password),
  });
}
