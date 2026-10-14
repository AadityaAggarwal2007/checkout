'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { inr } from '@/lib/money';
import { useStore } from '@/lib/store-context';

interface Row {
  id: string;
  at: string;
  phone: string;
  name: string | null;
  step: string;
  items: number;
  value: number;
  paymentTried: string | null;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function Abandoned() {
  const { store } = useStore();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<{ count: number; checkouts: Row[] } | null>(null);
  useEffect(() => {
    api<{ count: number; checkouts: Row[] }>(`/api/stores/${store.id}/abandoned?days=${days}`).then(setData);
  }, [store.id, days]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Abandoned checkouts</h1>
          <p className="text-ink-3">Shoppers who verified their phone but did not order (quiet for 30 minutes). Reach out to them yourself.</p>
        </div>
        <select className="input w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>Today</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-ink-line text-left text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Reached</th>
              <th className="px-4 py-3 text-right font-medium">Items</th>
              <th className="px-4 py-3 text-right font-medium">Cart value</th>
            </tr>
          </thead>
          <tbody>
            {data?.checkouts.map((r) => (
              <tr key={r.id} className="border-b border-ink-line last:border-0 hover:bg-ink-soft/50" data-test="abandoned-row">
                <td className="px-4 py-3">
                  <Link href={`/stores/${store.id}/abandoned/${r.id}`} className="font-medium text-brand-700">{when(r.at)}</Link>
                </td>
                <td className="px-4 py-3">
                  {r.name ?? '—'}
                  <div className="text-xs text-ink-3">{r.phone}</div>
                </td>
                <td className="px-4 py-3">
                  {r.step}
                  {r.paymentTried && <div className="text-xs text-ink-3">tried {r.paymentTried.toUpperCase()}</div>}
                </td>
                <td className="px-4 py-3 text-right">{r.items}</td>
                <td className="px-4 py-3 text-right font-medium">{inr(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.checkouts.length === 0 && <p className="p-5 text-ink-3">No abandoned checkouts in this period.</p>}
        {!data && <p className="p-5 text-ink-3">Loading…</p>}
      </div>
      {data && data.count > data.checkouts.length && <p className="text-sm text-ink-3">Showing the latest {data.checkouts.length} of {data.count}.</p>}
    </div>
  );
}
