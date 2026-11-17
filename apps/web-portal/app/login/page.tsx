import type { Metadata } from 'next';
import { AuthView } from '@/src/components/auth/AuthView';
import { getTelegramContactUrl } from '@/src/lib/telegram-contact';

export const metadata: Metadata = { title: 'Đăng nhập · TOOL HACK AI' };

// Đọc TELE_CONTRACT lúc chạy (không prerender tĩnh) để đổi giá trị chỉ cần restart container.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <AuthView telegramUrl={getTelegramContactUrl()} />;
}
