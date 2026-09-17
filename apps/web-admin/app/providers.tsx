'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider, type ThemeConfig } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Shared antd theme tokens — the single source of truth for colors/spacing.
 * Do not hardcode colors in components (see nextjs-frontend skill); read from
 * the theme instead.
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    colorBgLayout: '#f5f6f8',
  },
};

/**
 * Global client providers: antd SSR registry (avoids style flicker in the App
 * Router) + ConfigProvider(theme) + a single TanStack Query client.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <AntdRegistry>
      <ConfigProvider theme={theme} locale={viVN}>
        <AntdApp>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
