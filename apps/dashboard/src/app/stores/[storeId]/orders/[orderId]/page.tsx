'use client';
import { METHOD_LABELS } from '@checkout/shared/payments';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { inr } from '@/lib/money';
import { useStore } from '@/lib/store-context';
import { MODE, type OrderRow } from '@/lib/orders';

interface Detail extends OrderRow {
  contactEmail: string | null;
  shippingAddress: { name: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; phone?: string };
  note: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  couponCodes: string[];
  attribution: { utm?: Record<string, string>; landing?: string; referrer?: string; fbclid?: string } | null;
  lines: Array<{ id: string; title: string; variantTitle: string | null; image: string | null; quantity: number; unitPrice: number; discount: number; total: number; isGift: boolean }>;
  usageCharge: { amount: number; rateBps: number; status: string } | null;
  session: { createdAt: string; source: string };
}
interface Attempt {
  id: string;
  provider: string;
  method: string | null;
  status: string;
  amount: number;
  createdAt: string;
}

export default function OrderDetail() {
  const { store } = useStore();
  const { orderId } = useParams<{ orderId: string }>();
  const [data, setData] = useState<{ order: Detail; attempts: Attempt[] } | null>(null);
  const url = `/api/stores/${store.id}/orders/${orderId}`;
  const load = useCallback(() => api<{ order: Detail; attempts: Attempt[] }>(url).then(setData), [url]);
  useEffect(() => void load(), [load]);
  if (!data) return <p className="text-ink-3">Loading…</p>;
  const o = data.order;
  const a = o.shippingAddress;

  async function push() {
    try {
      const r = await api<{ shopifyName: string | null; shopifyError: string | null }>(`${url}/push-shopify`, { body: {} });
      toast(r.shopifyName ? `Created in Shopify as ${r.shopifyName}` : `Still failing: ${r.shopifyError}`, r.shopifyName ? 'ok' : 'err');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not send.', 'err');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={`/stores/${store.id}/orders`} className="text-sm text-ink-3 hover:text-ink">← Orders</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{o.number}</h1>
        <span className={`chip ${MODE[o.paymentMode][1]}`}>{MODE[o.paymentMode][0]}</span>
        {o.shopifyName ? <span className="chip bg-ink-soft text-ink-2">Shopify {o.shopifyName}</span> : <button className="btn-secondary" onClick={() => void push()}>Send to Shopify again</button>}
        <span className="text-ink-3">{new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </div>
      {o.shopifyError && !o.shopifyName && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">Shopify said: {o.shopifyError}</div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Items</h2>
            {o.lines.map((l) => (
              <div key={l.id} className="flex items-center gap-3 border-b border-ink-line py-2.5 last:border-0">
                {l.image ? <img src={l.image} alt="" className="h-12 w-12 rounded-lg border border-ink-line object-cover" /> : <div className="h-12 w-12 rounded-lg bg-ink-soft" />}
                <div className="flex-1">
                  <div className="font-medium">{l.title} {l.isGift && <span className="chip bg-violet-100 text-violet-700">Free gift</span>}</div>
                  <div className="text-xs text-ink-3">{l.variantTitle ?? ''} · {inr(l.unitPrice)} × {l.quantity}{l.discount > 0 ? ` · −${inr(l.discount)}` : ''}</div>
                </div>
                <div className="font-semibold">{l.total === 0 ? 'FREE' : inr(l.total)}</div>
              </div>
            ))}
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row k="Subtotal" v={inr(o.subtotal)} />
              {o.discount > 0 && <Row k={`Discounts (${o.couponCodes.join(', ')})`} v={`−${inr(o.discount)}`} />}
              <Row k="Shipping" v={o.shipping === 0 ? 'Free' : inr(o.shipping)} />
              {o.codFee > 0 && <Row k="COD charge" v={inr(o.codFee)} />}
              <Row k="Total" v={inr(o.total)} strong />
              {o.paidAmount > 0 && <Row k="Paid online" v={inr(o.paidAmount)} />}
              {o.dueOnDelivery > 0 && <Row k="Collect on delivery" v={inr(o.dueOnDelivery)} strong />}
            </dl>
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Payment attempts</h2>
            {data.attempts.length === 0 && <p className="text-sm text-ink-3">Cash on delivery: no online payment.</p>}
            {data.attempts.map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-ink-line py-2 text-sm last:border-0">
                <span>{t.provider} · {METHOD_LABELS[t.method ?? ''] ?? t.method}</span>
                <span className="text-ink-3">{new Date(t.createdAt).toLocaleTimeString('en-IN')}</span>
                <span className={`chip ${t.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : t.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-ink-soft text-ink-2'}`}>{t.status}</span>
                <span className="font-semibold">{inr(t.amount)}</span>
              </div>
            ))}
          </section>
        </div>
        <div className="space-y-5">
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">Customer</h2>
            <p>{o.contactName}</p>
            <p className="text-ink-3">{o.contactPhone}</p>
            {o.contactEmail && <p className="text-ink-3">{o.contactEmail}</p>}
            <h3 className="mt-4 mb-1 font-semibold">Ship to</h3>
            <p className="text-ink-2">{[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}<br />{a.city}, {a.state} {a.pincode}</p>
            {o.note && (<><h3 className="mt-4 mb-1 font-semibold">Note</h3><p className="text-ink-2">{o.note}</p></>)}
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">Where it came from</h2>
            <p className="text-ink-3">{o.session.source === 'buy_now' ? 'Buy it now' : 'Cart'}</p>
            {o.attribution?.utm && Object.entries(o.attribution.utm).map(([k, v]) => <p key={k}><span className="text-ink-3">{k}:</span> {v}</p>)}
            {o.attribution?.fbclid && <p className="text-ink-3">Meta ad click</p>}
            {o.attribution?.referrer && <p className="truncate text-ink-3" title={o.attribution.referrer}>From {o.attribution.referrer}</p>}
          </section>
          {o.usageCharge && (
            <section className="card p-5 text-sm">
              <h2 className="mb-1 font-semibold">Our fee</h2>
              <p className="text-ink-3">{o.usageCharge.rateBps / 100}% of the order: {inr(o.usageCharge.amount)} ({o.usageCharge.status.toLowerCase()})</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-semibold' : 'text-ink-2'}`}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
