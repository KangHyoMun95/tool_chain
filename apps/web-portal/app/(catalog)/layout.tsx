import type { ReactNode } from 'react';
import { AppShell } from '@/src/components/shell/AppShell';

// Các trang có sidebar (trang chủ, lobby) dùng chung một shell: sidebar không bị dựng lại khi chuyển qua lại giữa chúng,
// nên chỉ chạy hiệu ứng vào ở lần xuất hiện đầu tiên và không có hiệu ứng khi bấm "Trang chủ".
export default function CatalogLayout({ children }: { children: ReactNode }) {
  return <AppShell sidebar>{children}</AppShell>;
}
