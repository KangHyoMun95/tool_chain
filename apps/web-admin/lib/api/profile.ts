'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, getToken, type MeResponse } from './client';

/** Query key for the current account profile (GET /auth/me). */
export const ME_KEY = ['me'] as const;

export function useMyProfile() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiFetch<MeResponse>('/auth/me'),
    // Only when a token exists (avoids a 401 on the login screen).
    enabled: typeof window !== 'undefined' && !!getToken(),
    staleTime: 10_000,
  });
}
