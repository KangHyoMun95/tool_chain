import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SupportPanel } from '@/src/components/support/SupportPanel';
import { getTelegramContactUrl } from '@/src/lib/telegram-contact';

export const metadata: Metadata = { title: 'CSKH · TOOL HACK AI' };

// Đọc TELE_CONTRACT lúc chạy (không prerender tĩnh). Không hợp lệ ⇒ 404 (khu vực CSKH ẩn hoàn toàn).
export const dynamic = 'force-dynamic';

export default function SupportPage() {
  const url = getTelegramContactUrl();
  if (!url) notFound();
  return <SupportPanel url={url} />;
}
