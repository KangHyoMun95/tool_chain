import type { ReactNode } from 'react';
import { AppShell } from '@/src/components/shell/AppShell';
import { getTelegramContactUrl } from '@/src/lib/telegram-contact';

// Đọc TELE_CONTRACT lúc chạy: có link hợp lệ thì sidebar mới hiện mục CSKH.
export const dynamic = 'force-dynamic';

// Các trang có sidebar (trang chủ, lobby, CSKH) dùng chung một shell: sidebar không bị dựng lại khi chuyển qua lại giữa chúng,
// nên chỉ chạy hiệu ứng vào ở lần xuất hiện đầu tiên và không có hiệu ứng khi bấm "Trang chủ".
export default function CatalogLayout({ children }: { children: ReactNode }) {
  return <AppShell sidebar supportEnabled={getTelegramContactUrl() !== null}>{children}</AppShell>;
}
