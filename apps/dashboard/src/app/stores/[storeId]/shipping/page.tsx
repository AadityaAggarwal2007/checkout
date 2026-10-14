'use client';
import type { ShippingSettings } from '@checkout/shared';
import { INDIAN_STATES } from '@checkout/shared/india';
import { useEffect, useState } from 'react';
import { Checkbox, Field, Select, Toggle } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { toPaise, toRupeesText } from '@/lib/money';
import { useStore } from '@/lib/store-context';

/** Form state: numbers as typed (₹ for price slabs, grams for weight slabs). */
interface SlabForm {
  min: string;
  max: string;
  charge: string;
  codAllowed: boolean;
}
interface RateForm {
  name: string;
  eta: string;
  basis: 'PRICE' | 'WEIGHT';
  active: boolean;
  slabs: SlabForm[];
  pincodes: string;
}
interface ZoneForm {
  name: string;
  states: string[];
  rates: RateForm[];
}

const newRate = (): RateForm => ({ name: 'Standard', eta: '', basis: 'PRICE', active: true, slabs: [{ min: '0', max: '', charge: '0', codAllowed: true }], pincodes: '' });

function toForm(s: ShippingSettings): ZoneForm[] {
  return s.zones.map((z) => ({
    name: z.name,
    states: z.states,
    rates: z.rates.map((r) => {
      const show = (n: number) => (r.basis === 'PRICE' ? toRupeesText(n) : String(n));
      return {
        name: r.name,
        eta: r.eta ?? '',
        basis: r.basis,
        active: r.active,
        slabs: r.slabs.map((x) => ({ min: show(x.min), max: x.max === null ? '' : show(x.max), charge: toRupeesText(x.charge), codAllowed: x.codAllowed })),
        pincodes: r.blockedPincodes.join(', '),
      };
    }),
  }));
}

function fromForm(zones: ZoneForm[]): ShippingSettings | string {
  const out: ShippingSettings = { zones: [] };
  for (const z of zones) {
    const rates = [];
    for (const r of z.rates) {
      const num = (t: string) => (r.basis === 'PRICE' ? toPaise(t) : /^\d{1,7}$/.test(t.trim()) ? Number(t) : null);
      const slabs = [];
      for (const s of r.slabs) {
        const min = num(s.min || '0');
        const max = s.max.trim() ? num(s.max) : null;
        const charge = toPaise(s.charge || '0');
        if (min === null || charge === null || (s.max.trim() && max === null)) return `${z.name} / ${r.name}: check the slab numbers`;
        slabs.push({ min, max, charge, codAllowed: s.codAllowed });
      }
      const pins = r.pincodes.split(/[\s,]+/).filter(Boolean);
      const bad = pins.find((p) => !/^[1-9]\d{5}$/.test(p));
      if (bad) return `${r.name}: "${bad}" is not a 6-digit pincode`;
      rates.push({ name: r.name, eta: r.eta.trim() || null, basis: r.basis, active: r.active, slabs, blockedPincodes: pins });
    }
    out.zones.push({ name: z.name, states: z.states, rates });
  }
  return out;
}

export default function Shipping() {
  const { store, role } = useStore();
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const [zones, setZones] = useState<ZoneForm[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const url = `/api/stores/${store.id}/shipping`;

  useEffect(() => {
    api<{ shipping: ShippingSettings; warnings: string[] }>(url).then((r) => {
      setZones(toForm(r.shipping));
      setWarnings(r.warnings);
    });
  }, [url]);

  if (!zones) return <p className="text-ink-3">Loading…</p>;
  const update = (zi: number, patch: Partial<ZoneForm>) => setZones((zs) => zs!.map((z, i) => (i === zi ? { ...z, ...patch } : z)));
  const updateRate = (zi: number, ri: number, patch: Partial<RateForm>) => update(zi, { rates: zones[zi]!.rates.map((r, i) => (i === ri ? { ...r, ...patch } : r)) });
  const used = new Set(zones.flatMap((z) => z.states));

  async function submit() {
    const body = fromForm(zones!);
    if (typeof body === 'string') return toast(body, 'err');
    try {
      const r = await api<{ shipping: ShippingSettings; warnings: string[] }>(url, { method: 'PUT', body });
      setZones(toForm(r.shipping));
      setWarnings(r.warnings);
      toast('Shipping saved');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Shipping</h1>
          <p className="text-ink-3">Zones of states, a charge per order value (or weight), and where COD is allowed. A charge above ₹0 is never shown as "Free".</p>
        </div>
        {canEdit && <button className="btn-primary" onClick={() => void submit()}>Save</button>}
      </div>
      {warnings.map((w) => (
        <div key={w} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">⚠ {w}</div>
      ))}
      {zones.map((z, zi) => (
        <section key={zi} className="card space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Field label="Zone name">
                <input className="input" value={z.name} onChange={(e) => update(zi, { name: e.target.value })} />
              </Field>
            </div>
            <button className="btn-danger" onClick={() => confirm(`Delete zone ${z.name}?`) && setZones(zones.filter((_, i) => i !== zi))}>Delete zone</button>
          </div>
          <div>
            <span className="label">States</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {z.states.length === 0 && <span className="chip bg-brand-50 text-brand-700">All other states</span>}
              {z.states.map((st) => (
                <span key={st} className="chip gap-1 bg-ink-soft text-ink-2">
                  {st}
                  <button aria-label={`Remove ${st}`} onClick={() => update(zi, { states: z.states.filter((x) => x !== st) })}>×</button>
                </span>
              ))}
              <select className="input w-48 py-1" value="" onChange={(e) => e.target.value && update(zi, { states: [...z.states, e.target.value] })}>
                <option value="">+ Add a state</option>
                {INDIAN_STATES.filter((s) => !used.has(s)).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          {z.rates.map((r, ri) => (
            <div key={ri} className="space-y-3 rounded-lg border border-ink-line p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Rate name">
                  <input className="input" value={r.name} onChange={(e) => updateRate(zi, ri, { name: e.target.value })} />
                </Field>
                <Field label="Delivery time (shown)">
                  <input className="input" placeholder="5-7 days" value={r.eta} onChange={(e) => updateRate(zi, ri, { eta: e.target.value })} />
                </Field>
                <Field label="Based on">
                  <Select value={r.basis} onChange={(v) => updateRate(zi, ri, { basis: v })} options={[['PRICE', 'Order value (₹)'], ['WEIGHT', 'Weight (grams)']]} />
                </Field>
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <Toggle checked={r.active} onChange={(v) => updateRate(zi, ri, { active: v })} label="Active" /> Active
                </label>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-3">
                  <tr>
                    <th className="pb-1 font-medium">From {r.basis === 'PRICE' ? '(₹)' : '(g)'}</th>
                    <th className="pb-1 font-medium">Up to (blank = no limit)</th>
                    <th className="pb-1 font-medium">Charge (₹)</th>
                    <th className="pb-1 font-medium">COD</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {r.slabs.map((s, si) => {
                    const setSlab = (patch: Partial<SlabForm>) => updateRate(zi, ri, { slabs: r.slabs.map((x, i) => (i === si ? { ...x, ...patch } : x)) });
                    return (
                      <tr key={si}>
                        <td className="pr-2 pb-2"><input className="input" inputMode="decimal" value={s.min} onChange={(e) => setSlab({ min: e.target.value })} /></td>
                        <td className="pr-2 pb-2"><input className="input" inputMode="decimal" value={s.max} onChange={(e) => setSlab({ max: e.target.value })} /></td>
                        <td className="pr-2 pb-2"><input className="input" inputMode="decimal" value={s.charge} onChange={(e) => setSlab({ charge: e.target.value })} /></td>
                        <td className="pb-2"><Checkbox checked={s.codAllowed} onChange={(v) => setSlab({ codAllowed: v })} label="Allowed" /></td>
                        <td className="pb-2 text-right">
                          {r.slabs.length > 1 && <button className="text-red-600" onClick={() => updateRate(zi, ri, { slabs: r.slabs.filter((_, i) => i !== si) })}>Remove</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="btn-secondary" onClick={() => updateRate(zi, ri, { slabs: [...r.slabs, { min: r.slabs.at(-1)?.max ?? '', max: '', charge: '0', codAllowed: true }] })}>+ Slab</button>
              <Field label="Blocked pincodes (no delivery)" hint="Comma or new line separated.">
                <textarea className="input h-16" value={r.pincodes} onChange={(e) => updateRate(zi, ri, { pincodes: e.target.value })} />
              </Field>
              {z.rates.length > 1 && <button className="text-sm text-red-600" onClick={() => update(zi, { rates: z.rates.filter((_, i) => i !== ri) })}>Delete rate</button>}
            </div>
          ))}
          <button className="btn-secondary" onClick={() => update(zi, { rates: [...z.rates, newRate()] })}>+ Add rate</button>
        </section>
      ))}
      <button className="btn-secondary" onClick={() => setZones([...zones, { name: zones.length ? 'New zone' : 'India', states: [], rates: [newRate()] }])}>+ Add zone</button>
    </div>
  );
}
