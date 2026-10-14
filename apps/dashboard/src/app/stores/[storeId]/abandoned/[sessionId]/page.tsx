'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { inr } from '@/lib/money';
import { useStore } from '@/lib/store-context';

interface Detail {
  id: string;
  createdAt: string;
  updatedAt: string;
  phone: string;
  name: string | null;
  email: string | null;
  repeat: boolean;
  step: string;
  address: { line1?: string; city?: string; state?: string; pincode?: string } | null;
  lines: Array<{ title: string; variantTitle?: string; image?: string; quantity: number; unitPrice: number }>;
  value: number;
  coupons: string[];
  payments: Array<{ method: string | null; status: string; amount: number; at: string }>;
  source: string | null;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export default function AbandonedDetail({ params }: { params: { sessionId: string } }) {
  const { store } = useStore();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ checkout: Detail }>(`/api/stores/${store.id}/abandoned/${params.sessionId}`).then((r) => setD(r.checkout), (e) => setError(e instanceof ApiError ? e.message : 'Could not load.'));
  }, [store.id, params.sessionId]);
  if (error) return <p className="text-ink-3">{error}</p>;
  if (!d) return <p className="text-ink-3">Loading…</p>;
  const wa = `https://wa.me/${d.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi${d.name ? ` ${d.name.split(' ')[0]}` : ''}, you left some items in your cart at ${store.name}. Can we help you complete your order?`)}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/stores/${store.id}/abandoned`} className="btn-secondary px-3" aria-label="Back">←</Link>
        <h1 className="flex-1 text-xl font-semibold">{d.name ?? d.phone}</h1>
        <a className="btn-primary" href={wa} target="_blank" rel="noreferrer">Message on WhatsApp</a>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Cart · {inr(d.value)}</h2>
          {d.lines.map((l, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-ink-line py-2 first:border-0">
              <div className="h-12 w-12 overflow-hidden rounded-lg bg-ink-soft">{l.image && <img src={l.image} alt="" className="h-full w-full object-cover" />}</div>
              <div className="flex-1">
                <div className="font-medium">{l.title}</div>
                {l.variantTitle && <div className="text-xs text-ink-3">{l.variantTitle}</div>}
              </div>
              <div className="text-sm">{l.quantity} × {inr(l.unitPrice)}</div>
            </div>
          ))}
          {d.coupons.length > 0 && <p className="mt-2 text-sm text-ink-3">Codes typed: {d.coupons.join(', ')}</p>}
        </section>
        <section className="card space-y-3 p-5 text-sm">
          <div><div className="text-xs uppercase text-ink-3">Phone</div>{d.phone}</div>
          {d.email && <div><div className="text-xs uppercase text-ink-3">Email</div>{d.email}</div>}
          <div><div className="text-xs uppercase text-ink-3">Customer</div>{d.repeat ? 'Ordered before' : 'New'}</div>
          <div><div className="text-xs uppercase text-ink-3">Reached</div>{d.step}</div>
          {d.address && <div><div className="text-xs uppercase text-ink-3">Address</div>{[d.address.line1, d.address.city, d.address.state, d.address.pincode].filter(Boolean).join(', ')}</div>}
          {d.source && <div><div className="text-xs uppercase text-ink-3">Source</div>{d.source}</div>}
          <div><div className="text-xs uppercase text-ink-3">Started / last seen</div>{when(d.createdAt)}<br />{when(d.updatedAt)}</div>
          {d.payments.map((p, i) => (
            <div key={i}><div className="text-xs uppercase text-ink-3">Payment try</div>{(p.method ?? '').toUpperCase()} · {inr(p.amount)} · {p.status.toLowerCase()}</div>
          ))}
        </section>
      </div>
    </div>
  );
}
