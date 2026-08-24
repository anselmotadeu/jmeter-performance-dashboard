import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from '@/context/ThemeContext';
import { NotificationBanner } from '@/components/NotificationBanner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Performance Dashboard',
  description: 'Inteligência, histórico e comparação para testes JMeter e k6.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="light">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <NotificationBanner />
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
