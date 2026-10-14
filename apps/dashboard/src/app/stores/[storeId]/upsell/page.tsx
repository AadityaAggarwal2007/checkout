'use client';
import { describeUpsell, upsellInputSchema, type UpsellRuleData, type UpsellRuleView } from '@checkout/shared';
import { useEffect, useState } from 'react';
import { CollectionPicker } from '@/components/coupons/pickers';
import { ProductPicker } from '@/components/product-picker';
import { Field, NumberInput, Radio, TextInput, Toggle } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/lib/store-context';

interface Draft {
  id?: string;
  name: string;
  active: boolean;
  priority: number;
  whenKind: 'any' | 'products' | 'collections';
  whenIds: string[];
  rule: Omit<UpsellRuleData, 'when'>;
}

const blank = (): Draft => ({ name: 'Upsell', active: true, priority: 0, whenKind: 'any', whenIds: [], rule: { productIds: [], audience: 'all', discountPercent: 10, timerMinutes: 10, title: 'Add to your order', maxItems: 3 } });

function toDraft(u: UpsellRuleView): Draft {
  const { when, ...rule } = u.rule;
  return { id: u.id, name: u.name, active: u.active, priority: u.priority, whenKind: when.kind, whenIds: when.kind === 'products' ? when.productIds : when.kind === 'collections' ? when.collectionIds : [], rule };
}

function bodyOf(d: Draft) {
  const when = d.whenKind === 'any' ? { kind: 'any' } : d.whenKind === 'products' ? { kind: 'products', productIds: d.whenIds } : { kind: 'collections', collectionIds: d.whenIds };
  return { name: d.name, active: d.active, priority: d.priority, rule: { ...d.rule, when } };
}

export default function Upsell() {
  const { store, role } = useStore();
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const base = `/api/stores/${store.id}/upsells`;
  const [list, setList] = useState<UpsellRuleView[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = () => api<{ upsells: UpsellRuleView[] }>(base).then((r) => setList(r.upsells));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function call(path: string, method: string, body?: unknown, ok?: string): Promise<boolean> {
    try {
      await api(`${base}${path}`, { method, body });
      if (ok) toast(ok);
      await load();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
      return false;
    }
  }

  async function save() {
    if (!draft) return;
    const body = bodyOf(draft);
    const check = upsellInputSchema.safeParse(body);
    if (!check.success) return toast(check.error.issues[0]?.message ?? 'Check the upsell.', 'err');
    if (await call(draft.id ? `/${draft.id}` : '', draft.id ? 'PUT' : 'POST', body, 'Upsell saved')) setDraft(null);
  }

  if (!list) return <p className="text-ink-3">Loading…</p>;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setRule = (patch: Partial<Draft['rule']>) => setDraft((d) => (d ? { ...d, rule: { ...d.rule, ...patch } } : d));
  const preview = draft ? upsellInputSchema.safeParse(bodyOf(draft)) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Upsell</h1>
          <p className="text-ink-3">Offer more products on the payment step of the checkout, with an extra % off and a countdown. The highest-priority offer that fits the cart is shown.</p>
        </div>
        {canEdit && !draft && (
          <button className="btn-primary" data-test="add-upsell" onClick={() => setDraft(blank())}>
            Add upsell
          </button>
        )}
      </div>

      {draft && (
        <section className="card space-y-5 p-5" data-test="upsell-editor">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{draft.id ? 'Edit upsell' : 'New upsell'}</h3>
            <Toggle checked={draft.active} onChange={(active) => set({ active })} label="Upsell on" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name (only you see it)">
              <TextInput value={draft.name} max={60} onChange={(name) => set({ name })} />
            </Field>
            <Field label="Heading in the checkout" count={[draft.rule.title.length, 40]}>
              <TextInput value={draft.rule.title} max={40} onChange={(title) => setRule({ title })} />
            </Field>
          </div>

          <div>
            <span className="label">1. When the cart has</span>
            <Radio value={draft.whenKind} onChange={(whenKind) => set({ whenKind, whenIds: [] })} options={[['any', 'Anything'], ['products', 'Some products'], ['collections', 'Items of some collections']]} />
            <div className="mt-2">
              {draft.whenKind === 'products' && <ProductPicker storeId={store.id} value={draft.whenIds} onChange={(whenIds) => set({ whenIds })} max={200} />}
              {draft.whenKind === 'collections' && <CollectionPicker storeId={store.id} value={draft.whenIds} onChange={(whenIds) => set({ whenIds })} />}
            </div>
          </div>

          <div>
            <span className="label">2. Offer these products</span>
            <p className="hint mb-2">Products already in the cart are skipped. Sold-out ones are hidden.</p>
            <ProductPicker storeId={store.id} value={draft.rule.productIds} onChange={(productIds) => setRule({ productIds })} max={10} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Extra % off" hint="0 = full price">
              <NumberInput label="Extra % off" value={draft.rule.discountPercent} onChange={(n) => setRule({ discountPercent: n ?? 0 })} />
            </Field>
            <Field label="Timer (minutes)" hint="0 = no timer. Starts when the shopper first sees the offer.">
              <NumberInput label="Timer minutes" value={draft.rule.timerMinutes} onChange={(n) => setRule({ timerMinutes: n ?? 0 })} />
            </Field>
            <Field label="Show at most" hint="products at a time">
              <NumberInput label="Show at most" min={1} value={draft.rule.maxItems} onChange={(n) => setRule({ maxItems: n ?? 3 })} />
            </Field>
          </div>

          <div>
            <span className="label">3. Who sees it</span>
            <Radio value={draft.rule.audience} onChange={(audience) => setRule({ audience })} options={[['all', 'Everyone'], ['new', 'New customers (first order)'], ['repeat', 'Repeat customers']]} />
          </div>
          <Field label="Priority" hint="When several upsells fit a cart, the highest number is shown.">
            <NumberInput label="Priority" value={draft.priority} onChange={(p) => set({ priority: p ?? 0 })} />
          </Field>

          {preview?.success && <p className="rounded-lg bg-ink-soft px-3 py-2 text-sm" data-test="upsell-summary">{describeUpsell(preview.data.rule)}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" data-test="save-upsell" onClick={() => void save()}>Save upsell</button>
            <button className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="card divide-y divide-ink-line">
        {list.length === 0 && <p className="p-5 text-ink-3">No upsells yet.</p>}
        {list.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 p-4" data-test="upsell-row">
            <div className="min-w-48 flex-1">
              <div className="font-medium">{u.name}</div>
              <div className="text-sm text-ink-3">
                {u.text} · priority {u.priority}
              </div>
            </div>
            {canEdit && (
              <>
                <Toggle checked={u.active} label={`${u.name} on`} onChange={(active) => void call(`/${u.id}`, 'PATCH', { active }, active ? 'Upsell on' : 'Upsell off')} />
                <button className="btn-secondary" onClick={() => setDraft(toDraft(u))}>Edit</button>
                <button className="btn-danger" onClick={() => confirm(`Delete upsell "${u.name}"?`) && void call(`/${u.id}`, 'DELETE', undefined, 'Upsell deleted')}>
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
      </section>
      <p className="text-sm text-ink-3">The cart drawer has its own simple upsell list (Cart drawer → Upsells), shown at full price.</p>
    </div>
  );
}
