'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { inr } from '@/lib/money';

export interface Analytics {
  days: number;
  sales: number;
  orders: number;
  aov: number;
  discount: number;
  abandoned: number;
  byDay: Array<{ day: string; orders: number; sales: number }>;
  byMode: Array<{ mode: 'PREPAID' | 'COD' | 'PARTIAL_COD'; orders: number; sales: number }>;
  funnel: Array<{ step: string; count: number }>;
  coupons: Array<{ code: string; orders: number; sales: number; discount: number }>;
  sources: Array<{ source: string; orders: number; sales: number }>;
  exitReasons: Array<{ reason: string; count: number }>;
}

const PERIODS: Array<[number, string]> = [
  [1, 'Today'],
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
];
const MODE_LABEL = { PREPAID: 'Prepaid', COD: 'COD', PARTIAL_COD: 'Partial COD' };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

/** Dashboard home numbers: everything comes from our own orders and checkout sessions. */
export function AnalyticsPanel({ storeId }: { storeId: string }) {
  const [days, setDays] = useState(7);
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    setA(null);
    api<Analytics>(`/api/stores/${storeId}/analytics?days=${days}`).then(setA, () => undefined);
  }, [storeId, days]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Performance</h2>
        <div className="flex gap-1 rounded-xl border border-ink-line bg-white p-1">
          {PERIODS.map(([d, label]) => (
            <button key={d} data-test={`period-${d}`} onClick={() => setDays(d)} className={`rounded-lg px-3 py-1 text-sm font-medium ${days === d ? 'bg-ink text-white' : 'text-ink-2 hover:bg-ink-soft'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!a ? (
        <p className="text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Net sales" value={inr(a.sales)} test="kpi-sales" />
            <Kpi label="Orders" value={String(a.orders)} test="kpi-orders" />
            <Kpi label="Average order" value={inr(a.aov)} />
            <Kpi label="Conversion" value={pct(a.funnel[4]?.count ?? 0, a.funnel[0]?.count ?? 0)} hint="Checkouts opened → orders" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Sales by day</h3>
              <DayBars rows={a.byDay} />
            </section>
            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Checkout funnel</h3>
              <div className="space-y-2" data-test="funnel">
                {a.funnel.map((f) => (
                  <Bar key={f.step} label={f.step} value={f.count} max={a.funnel[0]?.count ?? 0} right={`${f.count} · ${pct(f.count, a.funnel[0]?.count ?? 0)}`} />
                ))}
              </div>
              {a.abandoned > 0 && (
                <Link href={`/stores/${storeId}/abandoned`} className="mt-3 inline-block text-sm font-semibold text-brand-700">
                  {a.abandoned} abandoned with a verified phone →
                </Link>
              )}
            </section>
            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Payment mix</h3>
              {a.byMode.length === 0 ? <Empty /> : <div className="space-y-2">{a.byMode.map((m) => <Bar key={m.mode} label={MODE_LABEL[m.mode]} value={m.orders} max={a.orders} right={`${m.orders} · ${inr(m.sales)}`} />)}</div>}
            </section>
            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Sales by source (UTM)</h3>
              {a.sources.length === 0 ? <Empty /> : <div className="space-y-2">{a.sources.map((s) => <Bar key={s.source} label={s.source} value={s.sales} max={a.sales} right={`${s.orders} · ${inr(s.sales)}`} />)}</div>}
            </section>
            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Coupons</h3>
              {a.coupons.length === 0 ? (
                <Empty />
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-ink-3">
                    <tr>
                      <th className="py-1 font-medium">Code</th>
                      <th className="py-1 text-right font-medium">Orders</th>
                      <th className="py-1 text-right font-medium">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.coupons.map((c) => (
                      <tr key={c.code} className="border-t border-ink-line">
                        <td className="py-1.5 font-medium">{c.code}</td>
                        <td className="py-1.5 text-right">{c.orders}</td>
                        <td className="py-1.5 text-right">{inr(c.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card p-5">
              <h3 className="mb-3 font-semibold">Why shoppers left (exit survey)</h3>
              {a.exitReasons.length === 0 ? <Empty text="No answers yet. Turn the survey on in Checkout design → Exit popup." /> : <div className="space-y-2">{a.exitReasons.map((e) => <Bar key={e.reason} label={e.reason} value={e.count} max={a.exitReasons[0]!.count} right={String(e.count)} />)}</div>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, test }: { label: string; value: string; hint?: string; test?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-1 text-2xl font-semibold" data-test={test}>{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

function Bar({ label, value, max, right }: { label: string; value: number; max: number; right: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="truncate">{label}</span>
        <span className="text-ink-3">{right}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-ink-soft">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

function DayBars({ rows }: { rows: Analytics['byDay'] }) {
  if (rows.length === 0) return <Empty />;
  const max = Math.max(...rows.map((r) => r.sales), 1);
  return (
    <div className="flex h-40 items-end gap-1">
      {rows.map((r) => (
        <div key={r.day} className="group relative flex flex-1 flex-col items-center justify-end" title={`${r.day}: ${inr(r.sales)} · ${r.orders} orders`}>
          <div className="w-full rounded-t bg-brand-600" style={{ height: `${Math.max(3, (r.sales / max) * 100)}%` }} />
          <span className="mt-1 text-[10px] text-ink-3">{r.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

const Empty = ({ text = 'No orders in this period yet.' }: { text?: string }) => <p className="text-sm text-ink-3">{text}</p>;
