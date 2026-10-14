import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ToastHost } from '@/components/ui/toast';

export const metadata: Metadata = { title: 'Checkout dashboard', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-[14px]">
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
