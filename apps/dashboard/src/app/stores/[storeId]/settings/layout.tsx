'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useStore } from '@/lib/store-context';

const TABS: Array<[string, string]> = [
  ['payments', 'Payments'],
  ['integrations', 'Integrations'],
  ['team', 'Team'],
  ['api-keys', 'API keys'],
  ['activity', 'Activity log'],
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { store } = useStore();
  const path = usePathname();
  return (
    <div className="space-y-5">
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto rounded-xl border border-ink-line bg-white p-1">
        {TABS.map(([k, label]) => {
          const href = `/stores/${store.id}/settings/${k}`;
          return (
            <Link key={k} href={href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${path.startsWith(href) ? 'bg-ink text-white' : 'text-ink-2 hover:bg-ink-soft'}`}>
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
