import type { Metadata } from 'next';
import { AuthView } from '@/src/components/auth/AuthView';

export const metadata: Metadata = { title: 'Sign in · Nexus AI Royale' };

export default function LoginPage() {
  return <AuthView />;
}
