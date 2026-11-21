import type { Metadata } from 'next';
import { AutoTranslate } from '@/lib/auto-translate';
import { LanguageProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'JR COMMUNICATION — ISP Billing',
  description: 'Smart ISP billing, client portal and upstream sync',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" data-theme="light">
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <AutoTranslate />
            {children}
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
