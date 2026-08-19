import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShopDrawer - Dashboard',
  description: 'Configure your Shopify checkout drawer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
