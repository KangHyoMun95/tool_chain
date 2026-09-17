import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'ToolHackChain — Security Admin',
  description: 'Dark SOC admin console (Host -> Admin(Con) -> User)',
};

/**
 * Dark SOC theme baseline (see .claude/designs/WEB-ADMIN.DESIGN.md):
 * near-solid dark ground + monospace headings ("read system data" feel).
 */
const themeCss = `
  :root { color-scheme: dark; }
  body { margin: 0; background: #0A0E14; color: #F3F4F6; }
  h1, h2, h3,
  .ant-page-header-heading-title,
  .ant-pro-page-container-title,
  .ant-typography h1, .ant-typography h2 {
    font-family: ui-monospace, 'JetBrains Mono', 'Space Mono', 'SFMono-Regular',
      Menlo, Consolas, monospace;
    letter-spacing: 0.01em;
  }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, background: '#0A0E14' }}>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
