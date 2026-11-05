import type { Metadata } from 'next';
import { JetBrains_Mono, Outfit, Space_Grotesk } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/src/i18n/config';
import { AuthProvider } from '@/src/components/auth/AuthProvider';
import { I18nProvider } from '@/src/i18n/provider';
import './globals.css';
import './legacy.css';   // Royal Purple cũ, chỉ cho các trang chưa chuyển giao diện (xóa ở PR 4)

const bodyFont = Outfit({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-outfit',
  display: 'swap',
});

const displayFont = Space_Grotesk({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space',
  display: 'swap',
});

const monoFont = JetBrains_Mono({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TOOL HACK AI',
  description: 'Hệ thống phân tích thuật toán chuyên nghiệp.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const stored = cookies().get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : DEFAULT_LOCALE;

  return (
    <html lang={locale} className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}>
      <body>
        <I18nProvider initialLocale={locale}>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
