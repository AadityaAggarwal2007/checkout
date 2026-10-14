'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type Me } from '@/lib/api';

export default function Stores() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>('/api/auth/me').then((m) => {
      if (m.stores.length === 1) router.replace(`/stores/${m.stores[0]!.id}`);
      else setMe(m);
    }, () => undefined);
  }, [router]);
  if (!me) return null;
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="mb-4 text-xl font-semibold">Your stores</h1>
      {me.stores.length === 0 ? (
        <div className="card p-6 text-sm text-ink-2">
          <p className="font-medium text-ink">No store connected yet.</p>
          <p className="mt-1">Install the app from your Shopify admin; you will come back here with the store connected.</p>
        </div>
      ) : (
        <div className="card divide-y divide-ink-line">
          {me.stores.map((s) => (
            <Link key={s.id} href={`/stores/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-ink-soft">
              <span>
                <span className="block font-medium">{s.name}</span>
                <span className="text-xs text-ink-3">{s.shopDomain}</span>
              </span>
              <span className="chip bg-ink-soft text-ink-2">{s.role}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
