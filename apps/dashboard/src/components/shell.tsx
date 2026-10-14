'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, type Me } from '@/lib/api';
import { StoreContext, type StoreInfo } from '@/lib/store-context';

const NAV: Array<{ href: string; label: string; icon: string; soon?: string }> = [
  { href: '', label: 'Dashboard', icon: '▦' },
  { href: '/orders', label: 'Orders', icon: '◫' },
  { href: '/abandoned', label: 'Abandoned checkouts', icon: '⊘', soon: 'Phase 5' },
  { href: '/cart-drawer', label: 'Cart drawer', icon: '⊞' },
  { href: '/checkout-design', label: 'Checkout design', icon: '✎', soon: 'Phase 4' },
  { href: '/coupons', label: 'Coupons', icon: '%' },
  { href: '/payment-offers', label: 'Payment offers', icon: '₹' },
  { href: '/upsell', label: 'Upsell', icon: '↗', soon: 'Phase 4' },
  { href: '/shipping', label: 'Shipping', icon: '⛟' },
  { href: '/rto', label: 'RTO suite', icon: '⛨' },
  { href: '/settings', label: 'Settings · Payments', icon: '⚙' },
];

export function StoreShell({ storeId, children }: { storeId: string; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [data, setData] = useState<{ store: StoreInfo; role: string } | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  const [nav, setNav] = useState(false);
  const base = `/stores/${storeId}`;

  useEffect(() => {
    api<{ store: StoreInfo; role: string }>(`/api/stores/${storeId}`).then(setData, () => router.replace('/stores'));
    api<Me>('/api/auth/me').then(setMe, () => undefined);
  }, [storeId, router]);

  async function logout() {
    await api('/api/auth/logout', { body: {} }).catch(() => undefined);
    router.replace('/login');
  }

  if (!data) return <div className="grid min-h-screen place-items-center text-ink-3">Loading…</div>;
  return (
    <StoreContext.Provider value={data}>
      <div className="flex min-h-screen">
        <aside className={`fixed inset-y-0 left-0 z-40 w-60 border-r border-ink-line bg-white p-3 transition-transform lg:static lg:translate-x-0 ${nav ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-4 flex items-center gap-2 px-2 py-2 text-[15px] font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white">⚡</span> Checkout
          </div>
          <nav className="space-y-0.5">
            {NAV.map((n) => {
              const href = `${base}${n.href}`;
              const active = n.href === '' ? path === base : path.startsWith(href);
              if (n.soon)
                return (
                  <span key={n.href} className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-ink-3" title={`Coming in ${n.soon}`}>
                    <span className="w-4 text-center">{n.icon}</span>
                    <span className="flex-1">{n.label}</span>
                    <span className="chip bg-ink-soft text-[10px] text-ink-3">Soon</span>
                  </span>
                );
              return (
                <Link key={n.href} href={href} onClick={() => setNav(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 font-medium ${active ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-ink-soft'}`}>
                  <span className="w-4 text-center">{n.icon}</span>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        {nav && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setNav(false)} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-ink-line bg-white/90 px-4 backdrop-blur lg:px-8">
            <button className="btn-secondary px-2.5 lg:hidden" onClick={() => setNav(true)} aria-label="Menu">☰</button>
            <span />
            <div className="relative">
              <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium hover:bg-ink-soft" onClick={() => setMenu((m) => !m)}>
                🏬 {data.store.name} <span className="text-ink-3">▾</span>
              </button>
              {menu && (
                <div className="absolute right-0 mt-1 w-64 rounded-xl border border-ink-line bg-white p-1.5 shadow-lg" onMouseLeave={() => setMenu(false)}>
                  <div className="px-3 py-2 text-xs text-ink-3">{me?.user.email}</div>
                  {me?.stores.map((s) => (
                    <Link key={s.id} href={`/stores/${s.id}`} className={`block rounded-lg px-3 py-2 hover:bg-ink-soft ${s.id === storeId ? 'font-semibold' : ''}`}>
                      {s.name}
                    </Link>
                  ))}
                  <button className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={logout}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </header>
          <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </StoreContext.Provider>
  );
}
