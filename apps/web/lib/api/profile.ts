'use client';

import { useQuery } from '@tanstack/react-query';
import { ProfileResponse } from '@toolhackchain/shared';
import { apiFetch, getToken } from './client';

/** Query key for the current account profile (id, role, username, points). */
export const ME_KEY = ['me'] as const;

/** Fetches the current account profile from GET /auth/me. */
export function useMyProfile() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiFetch<ProfileResponse>('/auth/me'),
    // Only when a token exists (avoids a 401 on the login screen).
    enabled: typeof window !== 'undefined' && !!getToken(),
    staleTime: 10_000,
  });
}
