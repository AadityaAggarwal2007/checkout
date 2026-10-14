'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { inr } from '@/lib/money';
import { MODE, type OrderRow } from '@/lib/orders';
import { useStore } from '@/lib/store-context';

export default function Orders() {
  const { store } = useStore();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('');
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(mode ? { mode } : {}), ...(cursor ? { cursor } : {}) });
      const r = await api<{ orders: OrderRow[]; nextCursor: string | null }>(`/api/stores/${store.id}/orders?${params}`);
      setRows((old) => (cursor ? [...(old ?? []), ...r.orders] : r.orders));
      setNext(r.nextCursor);
    },
    [store.id, q, mode],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-ink-3">Orders placed through your checkout. Each one is also created in Shopify.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Search order no., phone or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-44" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">All payments</option>
          <option value="PREPAID">Prepaid</option>
          <option value="COD">COD</option>
          <option value="PARTIAL_COD">Partial COD</option>
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-ink-line text-left text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Shopify</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((o) => (
              <tr key={o.id} className="border-b border-ink-line last:border-0 hover:bg-ink-soft/50">
                <td className="px-4 py-3">
                  <Link className="font-semibold text-brand-600 hover:underline" href={`/stores/${store.id}/orders/${o.id}`}>{o.number}</Link>
                  <div className="text-xs text-ink-3">{o._count.lines} item{o._count.lines === 1 ? '' : 's'}</div>
                </td>
                <td className="px-4 py-3 text-ink-2">{new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td className="px-4 py-3">
                  <div>{o.contactName ?? '—'}</div>
                  <div className="text-xs text-ink-3">{o.contactPhone}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${MODE[o.paymentMode][1]}`}>{MODE[o.paymentMode][0]}</span>
                  {o.dueOnDelivery > 0 && o.paidAmount > 0 && <div className="mt-0.5 text-xs text-ink-3">{inr(o.dueOnDelivery)} on delivery</div>}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{inr(o.total)}</td>
                <td className="px-4 py-3">{o.shopifyName ?? <span className={o.shopifyError ? 'text-red-600' : 'text-ink-3'}>{o.shopifyError ? 'Not sent yet' : 'Sending…'}</span>}</td>
              </tr>
            ))}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-3">No orders yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {next && <button className="btn-secondary" onClick={() => void load(next)}>Load more</button>}
    </div>
  );
}
