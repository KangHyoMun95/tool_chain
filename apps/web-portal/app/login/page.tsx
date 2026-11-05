import type { Metadata } from 'next';
import { AuthView } from '@/src/components/auth/AuthView';

export const metadata: Metadata = { title: 'Đăng nhập · TOOL HACK AI' };

export default function LoginPage() {
  return <AuthView />;
}
