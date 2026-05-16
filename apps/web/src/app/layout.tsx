import type { Metadata } from 'next';
import '@/styles/globals.css';
import { I18nShell } from '@/components/ui/I18nShell';
import { TelegramAdapter } from '@/components/ui/TelegramAdapter';

export const metadata: Metadata = {
  title: 'Bluffuminati · by filipOS®',
  description: 'Private Texas Hold’em — invite only, play-money chips · by filipOS®',
  authors: [{ name: 'filipOS®' }],
  applicationName: 'Bluffuminati',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">
        <TelegramAdapter />
        <I18nShell>{children}</I18nShell>
      </body>
    </html>
  );
}
