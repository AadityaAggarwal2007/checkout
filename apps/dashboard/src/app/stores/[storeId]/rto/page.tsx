'use client';
import { RTO_KINDS, rtoRuleInputSchema, type RtoConditionInput, type RtoRuleView } from '@checkout/shared';
import { INDIAN_STATES } from '@checkout/shared/india';
import { useEffect, useState } from 'react';
import { CollectionPicker } from '@/components/coupons/pickers';
import { ProductPicker } from '@/components/product-picker';
import { Checkbox, Field, MoneyInput, NumberInput, Radio, Toggle } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/lib/store-context';

type Kind = RtoConditionInput['kind'];
type Rule = RtoRuleView & { text: string };

/** Everything the editor may hold; only the fields of the chosen kind are sent. */
interface Draft {
  id?: string;
  name: string;
  active: boolean;
  priority: number;
  blockCod: boolean;
  blockPartialCod: boolean;
  kind: Kind;
  min?: number;
  max?: number;
  type: 'new' | 'repeat';
  mode: 'list' | 'allow_list';
  list: string;
  states: string[];
  ids: string[];
}

const blank = (kind: Kind): Draft => ({ name: RTO_KINDS.find((k) => k.kind === kind)!.title, active: true, priority: 0, blockCod: true, blockPartialCod: true, kind, type: 'new', mode: 'list', list: '', states: [], ids: [] });

function toDraft(r: Rule): Draft {
  const c = r.condition;
  const d: Draft = { ...blank(c.kind), id: r.id, name: r.name, active: r.active, priority: r.priority, blockCod: r.blockCod, blockPartialCod: r.blockPartialCod };
  if ('min' in c) d.min = c.min;
  if ('max' in c) d.max = c.max;
  if (c.kind === 'customer_type') d.type = c.type;
  if (c.kind === 'user') d.list = c.phones.join('\n');
  if (c.kind === 'pincode') Object.assign(d, { mode: c.mode, list: c.pincodes.join(', ') });
  if (c.kind === 'state') Object.assign(d, { mode: c.mode, states: c.states });
  if (c.kind === 'product') d.ids = c.productIds;
  if (c.kind === 'collection') d.ids = c.collectionIds;
  return d;
}

function conditionOf(d: Draft): unknown {
  const words = d.list.split(/[\s,;]+/).filter(Boolean);
  switch (d.kind) {
    case 'cart_amount':
    case 'item_count':
    case 'cod_orders':
      return { kind: d.kind, min: d.min, max: d.max };
    case 'customer_type':
      return { kind: d.kind, type: d.type };
    case 'returns':
      return { kind: d.kind, max: d.max ?? 0 };
    case 'user':
      return { kind: d.kind, phones: words };
    case 'pincode':
      return { kind: d.kind, mode: d.mode, pincodes: [...new Set(words)] };
    case 'state':
      return { kind: d.kind, mode: d.mode, states: d.states };
    case 'product':
      return { kind: d.kind, productIds: d.ids };
    case 'collection':
      return { kind: d.kind, collectionIds: d.ids };
  }
}

export default function RtoSuite() {
  const { store, role } = useStore();
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const base = `/api/stores/${store.id}/rto`;
  const [data, setData] = useState<{ mode: 'all' | 'single'; rules: Rule[] } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);

  const load = () => api<{ mode: 'all' | 'single'; rules: Rule[] }>(base).then(setData);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function call<T>(path: string, method: string, body?: unknown, ok?: string): Promise<T | null> {
    try {
      const r = await api<T>(`${base}${path}`, { method, body });
      if (ok) toast(ok);
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
      return null;
    }
  }

  async function save() {
    if (!draft) return;
    const body = { name: draft.name, active: draft.active, priority: draft.priority, blockCod: draft.blockCod, blockPartialCod: draft.blockPartialCod, condition: conditionOf(draft) };
    const check = rtoRuleInputSchema.safeParse(body);
    if (!check.success) return toast(check.error.issues[0]?.message ?? 'Check the rule.', 'err');
    const r = await call(draft.id ? `/rules/${draft.id}` : '/rules', draft.id ? 'PUT' : 'POST', body, 'Rule saved');
    if (r) {
      setDraft(null);
      await load();
    }
  }

  if (!data) return <p className="text-ink-3">Loading…</p>;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">RTO suite</h1>
          <p className="text-ink-3">Switch Cash on delivery off for risky orders. Shoppers then see only online payment, with a short reason. Rules apply in the checkout at once.</p>
        </div>
        {canEdit && !draft && (
          <button className="btn-primary" data-test="add-rto" onClick={() => setPicking(true)}>
            Add rule
          </button>
        )}
      </div>

      {picking && (
        <section className="card p-5">
          <h3 className="mb-3 font-semibold">What should the rule look at?</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {RTO_KINDS.map((k) => (
              <button key={k.kind} className="rounded-lg border border-ink-line p-3 text-left hover:border-brand-500 hover:bg-brand-50" onClick={() => (setDraft(blank(k.kind)), setPicking(false))}>
                <span className="block font-medium">{k.title}</span>
                <span className="text-sm text-ink-3">{k.text}</span>
              </button>
            ))}
          </div>
          <button className="btn-secondary mt-3" onClick={() => setPicking(false)}>Cancel</button>
        </section>
      )}

      {draft && (
        <section className="card space-y-4 p-5" data-test="rto-editor">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{draft.id ? 'Edit rule' : 'New rule'} · {RTO_KINDS.find((k) => k.kind === draft.kind)?.title}</h3>
            <Toggle checked={draft.active} onChange={(active) => set({ active })} label="Rule on" />
          </div>
          <Field label="Rule name">
            <input className="input" maxLength={60} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>

          {(draft.kind === 'cart_amount' || draft.kind === 'item_count' || draft.kind === 'cod_orders') && (
            <div>
              <p className="mb-2 text-sm text-ink-3">COD stays on only {draft.kind === 'cart_amount' ? 'for cart amounts' : draft.kind === 'item_count' ? 'for item counts' : 'for past COD orders'} inside this range. Leave one side empty for no limit.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Minimum">{draft.kind === 'cart_amount' ? <MoneyInput label="Minimum" value={draft.min} onChange={(min) => set({ min })} /> : <NumberInput label="Minimum" value={draft.min} onChange={(min) => set({ min })} />}</Field>
                <Field label="Maximum">{draft.kind === 'cart_amount' ? <MoneyInput label="Maximum" value={draft.max} onChange={(max) => set({ max })} /> : <NumberInput label="Maximum" value={draft.max} onChange={(max) => set({ max })} />}</Field>
              </div>
            </div>
          )}
          {draft.kind === 'customer_type' && (
            <Radio value={draft.type} onChange={(type) => set({ type })} options={[['new', 'New customer', 'First order with your store'], ['repeat', 'Repeat customer', 'Ordered before']]} />
          )}
          {draft.kind === 'returns' && (
            <Field label="Block when returned orders are more than" hint="0 = any return blocks COD">
              <NumberInput label="Returned orders" value={draft.max} onChange={(max) => set({ max })} />
            </Field>
          )}
          {draft.kind === 'user' && (
            <Field label="Mobile numbers" hint="One per line or comma separated. 10 digits, with or without +91.">
              <textarea className="input min-h-28 font-mono" value={draft.list} onChange={(e) => set({ list: e.target.value })} />
            </Field>
          )}
          {(draft.kind === 'pincode' || draft.kind === 'state') && (
            <Radio value={draft.mode} onChange={(mode) => set({ mode })} options={[['list', `Block COD for these ${draft.kind === 'pincode' ? 'pincodes' : 'states'}`], ['allow_list', `Allow COD ONLY for these ${draft.kind === 'pincode' ? 'pincodes' : 'states'}`]]} />
          )}
          {draft.kind === 'pincode' && (
            <Field label="Pincodes" hint="6 digits each, comma or new line between them.">
              <textarea className="input min-h-28 font-mono" data-test="rto-pincodes" value={draft.list} onChange={(e) => set({ list: e.target.value })} />
            </Field>
          )}
          {draft.kind === 'state' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {draft.states.map((st) => (
                <span key={st} className="chip gap-1 bg-ink-soft text-ink-2">
                  {st}
                  <button aria-label={`Remove ${st}`} onClick={() => set({ states: draft.states.filter((x) => x !== st) })}>×</button>
                </span>
              ))}
              <select className="input w-56 py-1" value="" onChange={(e) => e.target.value && set({ states: [...draft.states, e.target.value] })}>
                <option value="">+ Add a state</option>
                {INDIAN_STATES.filter((s) => !draft.states.includes(s)).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          {draft.kind === 'product' && <ProductPicker storeId={store.id} value={draft.ids} onChange={(ids) => set({ ids })} max={200} />}
          {draft.kind === 'collection' && <CollectionPicker storeId={store.id} value={draft.ids} onChange={(ids) => set({ ids })} />}

          <div className="space-y-2 border-t border-ink-line pt-4">
            <span className="label">When the rule matches, switch off</span>
            <Checkbox checked={draft.blockCod} onChange={(blockCod) => set({ blockCod })} label="Cash on delivery" />
            <Checkbox checked={draft.blockPartialCod} onChange={(blockPartialCod) => set({ blockPartialCod })} label="Partial COD (pay a part now, rest on delivery)" />
          </div>
          {data.mode === 'single' && (
            <Field label="Priority" hint="Higher number wins when several rules match.">
              <NumberInput label="Priority" value={draft.priority} onChange={(p) => set({ priority: p ?? 0 })} />
            </Field>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" data-test="save-rto" onClick={() => void save()}>Save rule</button>
            <button className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="card p-5">
        <h3 className="mb-3 font-semibold">When several rules match</h3>
        <Radio
          value={data.mode}
          onChange={async (mode) => {
            if (!canEdit) return;
            const r = await call<{ mode: 'all' | 'single'; rules: Rule[] }>('/settings', 'PUT', { mode }, 'Saved');
            if (r) setData(r);
          }}
          options={[
            ['all', 'Every matching rule applies', 'Safest: if any rule says no COD, COD is off.'],
            ['single', 'Only the top rule applies', 'The matching rule with the highest priority decides.'],
          ]}
        />
      </section>

      <section className="card divide-y divide-ink-line">
        {data.rules.length === 0 && <p className="p-5 text-ink-3">No rules yet. COD follows your payment and shipping settings.</p>}
        {data.rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-4" data-test="rto-row">
            <div className="min-w-48 flex-1">
              <div className="font-medium">{r.name}</div>
              <div className="text-sm text-ink-3">
                {r.text} → no {[r.blockCod && 'COD', r.blockPartialCod && 'partial COD'].filter(Boolean).join(' / ')}
                {data.mode === 'single' && ` · priority ${r.priority}`}
              </div>
            </div>
            {canEdit && (
              <>
                <Toggle
                  checked={r.active}
                  label={`${r.name} on`}
                  onChange={async (active) => {
                    if (await call(`/rules/${r.id}`, 'PATCH', { active }, active ? 'Rule on' : 'Rule off')) await load();
                  }}
                />
                <button className="btn-secondary" onClick={() => (setPicking(false), setDraft(toDraft(r)))}>Edit</button>
                <button
                  className="btn-danger"
                  onClick={async () => {
                    if (confirm(`Delete rule "${r.name}"?`) && (await call(`/rules/${r.id}`, 'DELETE', undefined, 'Rule deleted'))) await load();
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
