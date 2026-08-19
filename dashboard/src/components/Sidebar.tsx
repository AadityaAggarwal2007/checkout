'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/announcements', label: 'Announcements', icon: '📢' },
  { href: '/dashboard/reward-bar', label: 'Reward Bar', icon: '🎁' },
  { href: '/dashboard/upsells', label: 'Upsells', icon: '🛍️' },
  { href: '/dashboard/addons', label: 'Add-ons', icon: '➕' },
  { href: '/dashboard/notes', label: 'Additional Notes', icon: '📝' },
  { href: '/dashboard/confirmation', label: 'Confirmation Text', icon: '✅' },
  { href: '/dashboard/discounts', label: 'Discount Codes', icon: '🏷️' },
  { href: '/dashboard/trust-badges', label: 'Trust Badges', icon: '🛡️' },
  { href: '/dashboard/free-gifts', label: 'Free Gifts', icon: '🎀' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  { href: '/dashboard/colors', label: 'Colors', icon: '🎨' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r min-h-screen flex flex-col">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold text-primary">ShopDrawer</h1>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
