'use client';

import { useMutation } from '@tanstack/react-query';
import { AuthTokenResponse, LoginRequest } from '@toolhackchain/shared';
import { apiFetch, setSession } from './client';

/** Login mutation — posts credentials, stores the JWT + username on success. */
export function useLogin() {
  return useMutation({
    mutationFn: async (input: LoginRequest): Promise<AuthTokenResponse> => {
      const res = await apiFetch<AuthTokenResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setSession(res.accessToken, input.username);
      return res;
    },
  });
}
