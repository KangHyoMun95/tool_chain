'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { apiFetch } from './client';

export const HOSTNAMES_KEY = ['hostnames'] as const;

export interface HostnameRow {
  id: string;
  name: string;
  url: string;
  ownerSubAdminId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHostnameInput {
  name: string;
  url: string;
}
export interface UpdateHostnameInput {
  name?: string;
  url?: string;
}

export function fetchHostnames(): Promise<HostnameRow[]> {
  return apiFetch<HostnameRow[]>('/hostnames');
}
export function loadHostnames(qc: QueryClient): Promise<HostnameRow[]> {
  return qc.fetchQuery({ queryKey: HOSTNAMES_KEY, queryFn: fetchHostnames });
}

/** For select options / lists that re-render on change. */
export function useHostnames() {
  return useQuery({ queryKey: HOSTNAMES_KEY, queryFn: fetchHostnames });
}

export function useCreateHostname() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHostnameInput) =>
      apiFetch<HostnameRow>('/hostnames', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: HOSTNAMES_KEY }),
  });
}
export function useUpdateHostname() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateHostnameInput & { id: string }) =>
      apiFetch<HostnameRow>(`/hostnames/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: HOSTNAMES_KEY }),
  });
}
export function useDeleteHostname() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/hostnames/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: HOSTNAMES_KEY }),
  });
}
