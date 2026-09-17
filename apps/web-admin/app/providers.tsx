'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import {
  App as AntdApp,
  ConfigProvider,
  theme as antdTheme,
  type ThemeConfig,
} from 'antd';
import viVN from 'antd/locale/vi_VN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

const SANS =
  "Inter, Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * Dark SOC / cyber-threat theme for web-admin (see
 * .claude/designs/WEB-ADMIN.DESIGN.md). Single source of truth for tokens —
 * do not hardcode colors in components.
 */
export const theme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: '#22D3EE', // cyan
    colorInfo: '#22D3EE',
    colorSuccess: '#10B981',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    colorBgLayout: '#0A0E14',
    colorBgContainer: '#111827',
    colorBgElevated: '#161D2B',
    colorBorder: '#1F2937',
    colorBorderSecondary: '#1F2937',
    colorText: '#F3F4F6',
    colorTextSecondary: '#9CA3AF',
    colorTextTertiary: '#6B7280',
    borderRadius: 8,
    fontFamily: SANS,
  },
  components: {
    Layout: {
      bodyBg: '#0A0E14',
      headerBg: '#0B0F16',
      siderBg: '#0B0F16',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(34,211,238,0.08)',
      itemSelectedColor: '#22D3EE',
      itemColor: '#9CA3AF',
    },
    Card: { colorBgContainer: '#111827' },
    Table: { headerBg: '#161D2B', colorBgContainer: '#111827' },
    Modal: { contentBg: '#111827', headerBg: '#111827' },
  },
};

/**
 * Global client providers: antd SSR registry (avoids style flicker in the App
 * Router) + ConfigProvider(dark theme) + a single TanStack Query client.
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
