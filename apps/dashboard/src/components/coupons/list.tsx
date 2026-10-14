'use client';
import { COUPON_KINDS, type CouponListRow } from '@checkout/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Toggle } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { inr } from '@/lib/money';
import { useStore } from '@/lib/store-context';

const KIND_LABEL: Record<string, string> = Object.fromEntries([...COUPON_KINDS.map((k) => [k.kind, k.title]), ['payment_offer', 'Payment offer']]);

/** Coupons (or payment offers): search, stats, visibility / active switches, bulk actions. */
export function CouponList({ offers }: { offers: boolean }) {
  const { store, role } = useStore();
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const base = `/stores/${store.id}/${offers ? 'payment-offers' : 'coupons'}`;
  const [rows, setRows] = useState<CouponListRow[] | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [chooser, setChooser] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ ...(offers ? { kind: 'payment_offer' } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
    const r = await api<{ coupons: CouponListRow[] }>(`/api/stores/${store.id}/coupons?${params}`);
    setRows(r.coupons);
  }, [store.id, offers, q]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  async function run(work: () => Promise<unknown>, ok: string) {
    try {
      await work();
      toast(ok);
      setSelected([]);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong.', 'err');
    }
  }
  const patch = (id: string, body: object, ok: string) => run(() => api(`/api/stores/${store.id}/coupons/${id}`, { method: 'PATCH', body }), ok);
  const bulk = (action: string) => run(() => api(`/api/stores/${store.id}/coupons/bulk`, { body: { ids: selected, action } }), 'Done');

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{offers ? 'Payment offers' : 'Coupons'}</h1>
          <p className="text-ink-3">{offers ? 'A discount tied to how the shopper pays (UPI, cards…). Shown per method in the checkout.' : 'One set of rules for the cart drawer and the checkout.'}</p>
        </div>
        {canEdit &&
          (offers ? (
            <Link className="btn-primary" href={`${base}/new`}>+ Add offer</Link>
          ) : (
            <button className="btn-primary" onClick={() => setChooser(true)} data-test="add-coupon">+ Add coupon</button>
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Search code or title" value={q} onChange={(e) => setQ(e.target.value)} />
        {selected.length > 0 && canEdit && (
          <>
            <span className="text-sm text-ink-3">{selected.length} selected</span>
            <button className="btn-secondary" onClick={() => void bulk('activate')}>Activate</button>
            <button className="btn-secondary" onClick={() => void bulk('deactivate')}>Deactivate</button>
            <button className="btn-danger" onClick={() => confirm(`Delete ${selected.length}?`) && void bulk('delete')}>Delete</button>
          </>
        )}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-ink-line text-left text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" aria-label="Select all" checked={!!rows?.length && selected.length === rows.length} onChange={(e) => setSelected(e.target.checked ? rows?.map((r) => r.id) ?? [] : [])} />
              </th>
              <th className="px-2 py-3 font-medium">Code</th>
              <th className="px-2 py-3 text-right font-medium">Orders</th>
              <th className="px-2 py-3 text-right font-medium">Gross sales</th>
              <th className="px-2 py-3 text-right font-medium">Discount</th>
              <th className="px-2 py-3 text-right font-medium">Net sales</th>
              <th className="px-2 py-3 font-medium">Created</th>
              {!offers && <th className="px-2 py-3 font-medium">Visible</th>}
              <th className="px-2 py-3 font-medium">Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows?.map((c) => (
              <tr key={c.id} className="border-b border-ink-line last:border-0">
                <td className="px-4 py-3">
                  <input type="checkbox" aria-label={`Select ${c.code ?? c.headline}`} checked={selected.includes(c.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                </td>
                <td className="px-2 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link className="font-semibold text-brand-600 hover:underline" href={`${base}/${c.id}`}>{c.code ?? c.title ?? 'Automatic offer'}</Link>
                    {c.automatic && <span className="chip bg-amber-50 text-amber-700" title="Applies automatically">⚡ Auto</span>}
                    {c.kind === 'free_gift' && <span className="chip bg-violet-50 text-violet-700">Freebie</span>}
                    {c.combinable && <span className="chip bg-ink-soft text-ink-2">Combines</span>}
                  </div>
                  <div className="text-xs text-ink-3">{KIND_LABEL[c.kind]} · {c.title || c.headline}</div>
                </td>
                <td className="px-2 py-3 text-right">{c.stats.orders}</td>
                <td className="px-2 py-3 text-right">{inr(c.stats.gross)}</td>
                <td className="px-2 py-3 text-right">{inr(c.stats.discount)}</td>
                <td className="px-2 py-3 text-right">{inr(c.stats.net)}</td>
                <td className="px-2 py-3 text-ink-3">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                {!offers && (
                  <td className="px-2 py-3">
                    <input type="checkbox" disabled={!canEdit} aria-label="Visible to shoppers" checked={c.visible} onChange={(e) => void patch(c.id, { visible: e.target.checked }, e.target.checked ? 'Shown to shoppers' : 'Hidden from the list')} />
                  </td>
                )}
                <td className="px-2 py-3">
                  <Toggle checked={c.active} disabled={!canEdit} label="Active" onChange={(v) => void patch(c.id, { active: v }, v ? 'Activated' : 'Deactivated')} />
                </td>
                <td className="px-4 py-3 text-right">
                  {canEdit && <button className="text-ink-3 hover:text-red-600" aria-label="Delete" onClick={() => confirm(`Delete ${c.code ?? 'this offer'}?`) && void run(() => api(`/api/stores/${store.id}/coupons/${c.id}`, { method: 'DELETE' }), 'Deleted')}>🗑</button>}
                </td>
              </tr>
            ))}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-ink-3">{offers ? 'No payment offers yet.' : 'No coupons yet.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {chooser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setChooser(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create coupon</h2>
              <button aria-label="Close" onClick={() => setChooser(false)}>✕</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {COUPON_KINDS.map((k) => (
                <Link key={k.kind} href={`${base}/new?kind=${k.kind}`} className="rounded-xl border border-ink-line p-4 hover:border-brand-500 hover:bg-brand-50">
                  <div className="font-semibold">{k.title}</div>
                  <div className="text-sm text-ink-3">{k.text}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
