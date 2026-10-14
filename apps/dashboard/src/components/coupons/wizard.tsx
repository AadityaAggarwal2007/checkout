'use client';
import type { Coupon as CoreCoupon } from '@checkout/core';
import { couponDataToCore, couponDetails, couponHeadline, couponInputSchema, couponSummary, COUPON_KINDS } from '@checkout/shared';
import { ONLINE_METHOD_LABELS } from '@checkout/shared/payments';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Checkbox, Field, MoneyInput, NumberInput, Radio, Select, Toggle } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { cleanScope, GiftPicker, ScopePicker, type GiftChoice, type Scope } from './pickers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Kind = CoreCoupon['kind'];
type Value = { type: 'percent'; percent: number; maxDiscount?: number } | { type: 'fixed'; amount: number };

/** The wizard's working copy (close to the API's CouponInput; scopes may carry the picker's marker). */
export interface Draft {
  kind: Kind;
  automatic: boolean;
  code?: string;
  title?: string;
  details: string[];
  visible: boolean;
  active: boolean;
  priority: number;
  condition: { minSubtotal?: number; maxSubtotal?: number; minQuantity?: number; maxQuantity?: number; scope?: Scope };
  eligibility: { phones?: string[]; orders: 'all' | 'first' | { min?: number; max?: number } };
  limits: { totalUses?: number; perShopper?: number; combinable: boolean; startsAt?: string; endsAt?: string; disableCod: boolean; disablePartialCod: boolean };
  target?: 'order' | { scope: Scope };
  value?: Value | { type: 'bundle_price'; price: number };
  buy?: { quantity: number; scope: Scope };
  get?: { quantity: number; scope: Scope; percentOff: number };
  maxRepeats?: number;
  gifts?: GiftChoice[];
  maxShippingCharge?: number;
  scope?: Scope;
  bundleSize?: number;
  sameProductOnly?: boolean;
  behaviour?: { minOrders?: number; minLifetimeSpend?: number; lastOrderWithinDays?: number; lastOrderBeforeDays?: number };
  methods?: 'online' | Partial<Record<string, Value>>;
}

const base = (kind: Kind): Draft => ({
  kind,
  automatic: kind === 'payment_offer',
  details: [],
  visible: true,
  active: true,
  priority: 0,
  condition: {},
  eligibility: { orders: 'all' },
  limits: { combinable: true, disableCod: false, disablePartialCod: false },
});

export function newDraft(kind: Kind): Draft {
  const d = base(kind);
  switch (kind) {
    case 'amount_off':
      return { ...d, target: 'order', value: { type: 'percent', percent: 10 } };
    case 'buy_x_get_y':
      return { ...d, buy: { quantity: 1, scope: {} }, get: { quantity: 1, scope: { _mode: 'collections' } as Scope, percentOff: 100 } };
    case 'free_gift':
      return { ...d, gifts: [], condition: { minSubtotal: 49900 } };
    case 'free_shipping':
      return d;
    case 'bundle':
      return { ...d, scope: { _mode: 'collections' } as Scope, bundleSize: 3, value: { type: 'bundle_price', price: 99900 } };
    case 'purchase_driven':
      return { ...d, behaviour: { minOrders: 1 }, value: { type: 'percent', percent: 10 } };
    case 'payment_offer':
      return { ...d, methods: 'online', value: { type: 'percent', percent: 5 }, limits: { ...d.limits } };
  }
}

/** A saved coupon (engine shape + display fields) -> the wizard's draft. */
export function draftFromCoupon(c: any): Draft {
  const d: Draft = { ...base(c.kind), ...c, details: c.details ?? [], visible: c.visible ?? true };
  if (c.kind === 'free_gift') d.gifts = (c.gifts ?? []).map((g: any) => ({ productId: g.productId, variantId: g.variantId, quantity: g.quantity }));
  d.eligibility = { orders: c.eligibility?.orders ?? 'all', phones: c.eligibility?.phones };
  d.limits = { combinable: true, disableCod: false, disablePartialCod: false, ...c.limits };
  return d;
}

/** Draft -> what the API takes. */
function toInput(d: Draft): any {
  const out: any = { ...d, condition: { ...d.condition, scope: d.condition.scope ? cleanScope(d.condition.scope) : undefined } };
  if (d.target && d.target !== 'order') out.target = { scope: cleanScope(d.target.scope) };
  if (d.buy) out.buy = { ...d.buy, scope: cleanScope(d.buy.scope) };
  if (d.get) out.get = { ...d.get, scope: cleanScope(d.get.scope) };
  if (d.scope) out.scope = cleanScope(d.scope);
  if (d.gifts) out.gifts = d.gifts.map((g) => ({ variantId: g.variantId, quantity: g.quantity }));
  if (!d.code) delete out.code;
  if (!d.title) delete out.title;
  return out;
}

type Step = 'setup' | 'behaviour' | 'condition' | 'eligibility' | 'limits' | 'preview';
const STEP_LABEL: Record<Step, string> = { setup: 'Setup', behaviour: 'User behaviour', condition: 'Condition', eligibility: 'User eligibility', limits: 'Usage limits', preview: 'Preview' };

function stepsOf(kind: Kind): Step[] {
  if (kind === 'free_gift' || kind === 'payment_offer') return ['setup', 'condition', 'eligibility', 'limits'];
  if (kind === 'purchase_driven') return ['setup', 'behaviour', 'condition', 'eligibility', 'limits', 'preview'];
  return ['setup', 'condition', 'eligibility', 'limits', 'preview'];
}

export function CouponWizard({ storeId, initial, couponId, backHref }: { storeId: string; initial: Draft; couponId?: string; backHref: string }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [step, setStep] = useState<Step>('setup');
  const [saving, setSaving] = useState(false);
  const steps = stepsOf(d.kind);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  // Live check + words, exactly as the server and the shopper will see them.
  const parsed = useMemo(() => couponInputSchema.safeParse(toInput(d)), [d]);
  const core = useMemo(() => (parsed.success ? couponDataToCore(parsed.data, '', Object.fromEntries((d.gifts ?? []).map((g) => [g.variantId, { productId: g.productId, title: 'the free product', unitPrice: 0 }]))) : null), [parsed, d.gifts]);
  const summary = core ? couponSummary(core) : null;
  const kindName = d.kind === 'payment_offer' ? 'Payment offer' : COUPON_KINDS.find((k) => k.kind === d.kind)?.title ?? d.kind;

  async function save() {
    if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? 'Check the coupon.', 'err');
    setSaving(true);
    try {
      const url = `/api/stores/${storeId}/coupons${couponId ? `/${couponId}` : ''}`;
      await api(url, { method: couponId ? 'PUT' : 'POST', body: toInput(d) });
      toast(couponId ? 'Saved' : 'Created — live on your store');
      router.push(backHref);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
    } finally {
      setSaving(false);
    }
  }

  const i = steps.indexOf(step);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button className="text-sm text-ink-3 hover:text-ink" onClick={() => router.push(backHref)}>← Back</button>
          <h1 className="text-2xl font-semibold">{couponId ? 'Edit' : 'Create'} {kindName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Toggle checked={d.active} onChange={(v) => set({ active: v })} label="Active" /> Active
          </label>
          <button className="btn-primary" disabled={saving} onClick={() => void save()} data-test="save-coupon">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <ol className="flex flex-wrap gap-2 text-sm">
        {steps.map((s, n) => (
          <li key={s}>
            <button className={`rounded-full px-3 py-1.5 font-medium ${s === step ? 'bg-brand-600 text-white' : n < i ? 'bg-brand-50 text-brand-700' : 'bg-ink-soft text-ink-3'}`} onClick={() => setStep(s)}>
              {n + 1}. {STEP_LABEL[s]}
            </button>
          </li>
        ))}
      </ol>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="card space-y-5 p-5">
          {step === 'setup' && <SetupStep storeId={storeId} d={d} set={set} />}
          {step === 'behaviour' && <BehaviourStep d={d} set={set} />}
          {step === 'condition' && <ConditionStep storeId={storeId} d={d} set={set} />}
          {step === 'eligibility' && <EligibilityStep d={d} set={set} />}
          {step === 'limits' && <LimitsStep d={d} set={set} />}
          {step === 'preview' && <PreviewStep d={d} set={set} core={core} />}
          <div className="flex justify-between border-t border-ink-line pt-4">
            <button className="btn-secondary" disabled={i === 0} onClick={() => setStep(steps[i - 1]!)}>Back</button>
            {i < steps.length - 1 ? (
              <button className="btn-primary" onClick={() => setStep(steps[i + 1]!)} data-test="next-step">Next</button>
            ) : (
              <button className="btn-primary" disabled={saving} onClick={() => void save()}>Save</button>
            )}
          </div>
        </section>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Summary</div>
            <div className="mt-1 text-lg font-semibold">{d.code || (d.automatic ? 'Automatic offer' : 'No code yet')}</div>
            <div className="text-xs text-ink-3">{kindName} · {d.automatic ? 'Automatic' : 'Code'}</div>
            {summary ? (
              <>
                <p className="mt-3 font-medium" data-test="summary-headline">{summary.headline}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{summary.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Limits</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-2">{summary.limits.map((l) => <li key={l}>{l}</li>)}</ul>
              </>
            ) : (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{!parsed.success && parsed.error.issues[0]?.message}</p>
            )}
          </div>
          {core && d.kind !== 'payment_offer' && <ShopperCard d={d} core={core} />}
        </aside>
      </div>
    </div>
  );
}

type StepProps = { d: Draft; set: (p: Partial<Draft>) => void };

function ValueEditor({ value, onChange, allowCap = true }: { value: Value | undefined; onChange: (v: Value) => void; allowCap?: boolean }) {
  const v = value ?? { type: 'percent', percent: 10 };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Discount">
        <Select value={v.type} onChange={(t) => onChange(t === 'percent' ? { type: 'percent', percent: 10 } : { type: 'fixed', amount: 10000 })} options={[['percent', 'Percentage off'], ['fixed', 'Fixed amount (₹)']]} />
      </Field>
      {v.type === 'percent' ? (
        <Field label="Percent off">
          <NumberInput value={v.percent} onChange={(n) => onChange({ ...v, percent: n ?? 0 })} label="Percent off" />
        </Field>
      ) : (
        <Field label="Amount off">
          <MoneyInput value={v.amount} onChange={(p) => onChange({ type: 'fixed', amount: p ?? 0 })} label="Amount off" />
        </Field>
      )}
      {allowCap && v.type === 'percent' && (
        <div className="sm:col-span-2">
          <Checkbox checked={v.maxDiscount !== undefined} onChange={(on) => onChange({ ...v, maxDiscount: on ? 20000 : undefined })} label="Maximum discount cap" />
          {v.maxDiscount !== undefined && (
            <div className="mt-2 max-w-xs">
              <MoneyInput value={v.maxDiscount} onChange={(p) => onChange({ ...v, maxDiscount: p })} label="Maximum discount" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HowApplied({ d, set }: StepProps) {
  return (
    <>
      {d.kind === 'payment_offer' ? (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Applies automatically when the shopper chooses the payment method.</p>
      ) : (
        <Field label="How is it applied?">
          <Radio
            value={d.automatic ? 'auto' : 'code'}
            onChange={(v) => set({ automatic: v === 'auto' })}
            options={[
              ['code', 'Coupon code', 'The shopper types the code (or taps it in the coupon list).'],
              ['auto', 'Automatic', 'Applies by itself in the cart and the checkout when the rules match.'],
            ]}
          />
        </Field>
      )}
      <Field label={d.automatic ? 'Code (optional, shown on the offer)' : 'Discount code'} hint="Letters, numbers, - and _. Shoppers can type it in any case.">
        <input className="input uppercase" value={d.code ?? ''} placeholder="DIWALI10" data-test="coupon-code" onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, '') })} />
      </Field>
    </>
  );
}

function SetupStep({ storeId, d, set }: StepProps & { storeId: string }) {
  return (
    <div className="space-y-5">
      <HowApplied d={d} set={set} />
      {d.kind === 'amount_off' && (
        <>
          <Field label="Applies to">
            <Radio value={d.target === 'order' ? 'order' : 'products'} onChange={(v) => set({ target: v === 'order' ? 'order' : { scope: { _mode: 'collections' } as Scope } })} options={[['order', 'Amount off the order'], ['products', 'Amount off products']]} />
          </Field>
          {d.target && d.target !== 'order' && <ScopePicker storeId={storeId} allowAny={false} value={d.target.scope} onChange={(s) => set({ target: { scope: s } })} />}
          <ValueEditor value={d.value as Value} onChange={(v) => set({ value: v })} />
        </>
      )}
      {d.kind === 'buy_x_get_y' && (
        <>
          <h3 className="font-semibold">Customer buys</h3>
          <Field label="Quantity">
            <NumberInput value={d.buy?.quantity} min={1} onChange={(n) => set({ buy: { ...d.buy!, quantity: n ?? 1 } })} label="Buy quantity" />
          </Field>
          <ScopePicker storeId={storeId} value={d.buy?.scope} onChange={(s) => set({ buy: { ...d.buy!, scope: s } })} />
          <h3 className="font-semibold">Customer gets</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantity">
              <NumberInput value={d.get?.quantity} min={1} onChange={(n) => set({ get: { ...d.get!, quantity: n ?? 1 } })} label="Get quantity" />
            </Field>
            <Field label="At discount" hint="100% = free">
              <NumberInput value={d.get?.percentOff} min={1} onChange={(n) => set({ get: { ...d.get!, percentOff: Math.min(100, n ?? 100) } })} label="Percent off what they get" />
            </Field>
          </div>
          <ScopePicker storeId={storeId} allowAny={false} value={d.get?.scope} onChange={(s) => set({ get: { ...d.get!, scope: s } })} />
          <Field label="Repeat at most (times per order, optional)">
            <NumberInput value={d.maxRepeats} min={1} onChange={(n) => set({ maxRepeats: n })} label="Maximum repeats" />
          </Field>
        </>
      )}
      {d.kind === 'free_gift' && (
        <Field label="Free products" hint="Products given free are not counted by any other coupon.">
          <GiftPicker storeId={storeId} value={d.gifts ?? []} onChange={(g) => set({ gifts: g })} />
        </Field>
      )}
      {d.kind === 'free_shipping' && (
        <div>
          <Checkbox checked={d.maxShippingCharge !== undefined} onChange={(on) => set({ maxShippingCharge: on ? 10000 : undefined })} label="Do not cover shipping charges above an amount" />
          {d.maxShippingCharge !== undefined && (
            <div className="mt-2 max-w-xs">
              <MoneyInput value={d.maxShippingCharge} onChange={(p) => set({ maxShippingCharge: p })} label="Highest shipping charge covered" />
            </div>
          )}
        </div>
      )}
      {d.kind === 'bundle' && (
        <>
          <Field label="Applies to">
            <ScopePicker storeId={storeId} allowAny={false} value={d.scope} onChange={(s) => set({ scope: s })} />
          </Field>
          <Checkbox checked={!!d.sameProductOnly} onChange={(v) => set({ sameProductOnly: v })} label="Single product pack (all items of a bundle must be the same product)" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Items in the bundle">
              <NumberInput value={d.bundleSize} min={2} onChange={(n) => set({ bundleSize: n })} label="Items in the bundle" />
            </Field>
            <Field label="Discount type">
              <Select
                value={d.value?.type ?? 'bundle_price'}
                onChange={(t) => set({ value: t === 'bundle_price' ? { type: 'bundle_price', price: 99900 } : t === 'percent' ? { type: 'percent', percent: 10 } : { type: 'fixed', amount: 10000 } })}
                options={[['bundle_price', 'Fixed bundle price'], ['fixed', 'Fixed amount off'], ['percent', 'Percentage off']]}
              />
            </Field>
          </div>
          {d.value?.type === 'bundle_price' ? (
            <Field label="Bundle price">
              <div className="max-w-xs">
                <MoneyInput value={d.value.price} onChange={(p) => set({ value: { type: 'bundle_price', price: p ?? 0 } })} label="Bundle price" />
              </div>
            </Field>
          ) : (
            <ValueEditor value={d.value as Value} allowCap={false} onChange={(v) => set({ value: v })} />
          )}
          <Field label="Repeat at most (bundles per order, optional)">
            <NumberInput value={d.maxRepeats} min={1} onChange={(n) => set({ maxRepeats: n })} label="Maximum bundles" />
          </Field>
        </>
      )}
      {d.kind === 'purchase_driven' && <ValueEditor value={d.value as Value} onChange={(v) => set({ value: v })} />}
      {d.kind === 'payment_offer' && (
        <>
          <Field label="Custom title (optional)">
            <input className="input" value={d.title ?? ''} placeholder="Extra 5% off on UPI" onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Apply to">
            <Radio
              value={d.methods === 'online' ? 'online' : 'each'}
              onChange={(v) => set(v === 'online' ? { methods: 'online', value: (d.value as Value) ?? { type: 'percent', percent: 5 } } : { methods: { upi: { type: 'percent', percent: 5 } }, value: undefined })}
              options={[['online', 'All online payment modes'], ['each', 'Set for individual payment modes']]}
            />
          </Field>
          {d.methods === 'online' ? (
            <ValueEditor value={d.value as Value} onChange={(v) => set({ value: v })} />
          ) : (
            <div className="space-y-3">
              {Object.entries(ONLINE_METHOD_LABELS).map(([m, label]) => {
                const methods = (d.methods as Record<string, Value>) ?? {};
                const on = !!methods[m];
                return (
                  <div key={m} className="rounded-lg border border-ink-line p-3">
                    <Checkbox
                      checked={on}
                      label={label}
                      onChange={(v) => {
                        const next = { ...methods };
                        if (v) next[m] = { type: 'percent', percent: 5 };
                        else delete next[m];
                        set({ methods: next });
                      }}
                    />
                    {on && (
                      <div className="mt-3">
                        <ValueEditor value={methods[m]} onChange={(val) => set({ methods: { ...methods, [m]: val } })} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BehaviourStep({ d, set }: StepProps) {
  const b = d.behaviour ?? {};
  const setB = (patch: Partial<NonNullable<Draft['behaviour']>>) => set({ behaviour: { ...b, ...patch } });
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-3">Based on the customer's past orders in this store (they verify their phone with OTP first). Leave a field empty to not use it.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="At least this many past orders">
          <NumberInput value={b.minOrders} min={1} onChange={(n) => setB({ minOrders: n })} label="Minimum past orders" />
        </Field>
        <Field label="Spent at least">
          <MoneyInput value={b.minLifetimeSpend} onChange={(p) => setB({ minLifetimeSpend: p })} label="Minimum lifetime spend" />
        </Field>
        <Field label="Last order within (days)" hint="Reward recent buyers.">
          <NumberInput value={b.lastOrderWithinDays} min={1} onChange={(n) => setB({ lastOrderWithinDays: n })} label="Last order within days" />
        </Field>
        <Field label="No order in the last (days)" hint="Win back customers who stopped buying.">
          <NumberInput value={b.lastOrderBeforeDays} min={1} onChange={(n) => setB({ lastOrderBeforeDays: n })} label="No order for days" />
        </Field>
      </div>
    </div>
  );
}

function ConditionStep({ storeId, d, set }: StepProps & { storeId: string }) {
  const c = d.condition;
  const kind = c.minQuantity !== undefined || c.maxQuantity !== undefined ? 'qty' : c.minSubtotal !== undefined || c.maxSubtotal !== undefined ? 'amount' : 'none';
  const setC = (patch: Partial<Draft['condition']>) => set({ condition: { ...c, ...patch } });
  return (
    <div className="space-y-5">
      <Field label="Purchase requirement">
        <Radio
          value={kind}
          onChange={(v) => set({ condition: { scope: c.scope, ...(v === 'amount' ? { minSubtotal: 49900 } : v === 'qty' ? { minQuantity: 2 } : {}) } })}
          options={[['none', 'No purchase requirement'], ['amount', 'Minimum / maximum purchase amount'], ['qty', 'Minimum / maximum quantity of items']]}
        />
      </Field>
      {kind === 'amount' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum purchase amount">
            <MoneyInput value={c.minSubtotal} onChange={(p) => setC({ minSubtotal: p })} label="Minimum purchase amount" />
          </Field>
          <Field label="Maximum purchase amount (optional)">
            <MoneyInput value={c.maxSubtotal} onChange={(p) => setC({ maxSubtotal: p })} label="Maximum purchase amount" />
          </Field>
        </div>
      )}
      {kind === 'qty' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum items">
            <NumberInput value={c.minQuantity} min={1} onChange={(n) => setC({ minQuantity: n })} label="Minimum items" />
          </Field>
          <Field label="Maximum items (optional)">
            <NumberInput value={c.maxQuantity} min={1} onChange={(n) => setC({ maxQuantity: n })} label="Maximum items" />
          </Field>
        </div>
      )}
      {kind !== 'none' && (
        <Field label="Counted on">
          <ScopePicker storeId={storeId} value={c.scope} onChange={(s) => setC({ scope: s })} />
        </Field>
      )}
    </div>
  );
}

function EligibilityStep({ d, set }: StepProps) {
  const e = d.eligibility;
  const orders = e.orders === 'all' || e.orders === 'first' ? e.orders : 'count';
  const [phones, setPhones] = useState((e.phones ?? []).join('\n'));
  return (
    <div className="space-y-5">
      <Field label="Customers">
        <Radio
          value={e.phones?.length ? 'specific' : phones ? 'specific' : 'all'}
          onChange={(v) => {
            if (v === 'all') {
              setPhones('');
              set({ eligibility: { ...e, phones: undefined } });
            } else setPhones(' ');
          }}
          options={[['all', 'All customers'], ['specific', 'Specific customers (by mobile number)']]}
        />
      </Field>
      {(e.phones?.length || phones) && (
        <Field label="Mobile numbers" hint="One per line. They must verify with WhatsApp OTP to use it.">
          <textarea
            className="input h-28 font-mono"
            value={phones.trimStart()}
            onChange={(ev) => {
              setPhones(ev.target.value);
              set({ eligibility: { ...e, phones: ev.target.value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) } });
            }}
          />
        </Field>
      )}
      <Field label="Orders">
        <Radio
          value={orders}
          onChange={(v) => set({ eligibility: { ...e, orders: v === 'count' ? { min: 1 } : (v as 'all' | 'first') } })}
          options={[['all', 'All orders'], ['first', 'First order only'], ['count', 'By number of past orders']]}
        />
      </Field>
      {typeof e.orders === 'object' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="At least">
            <NumberInput value={e.orders.min} onChange={(n) => set({ eligibility: { ...e, orders: { ...(e.orders as object), min: n } } })} label="Minimum past orders" />
          </Field>
          <Field label="At most (optional)">
            <NumberInput value={e.orders.max} onChange={(n) => set({ eligibility: { ...e, orders: { ...(e.orders as object), max: n } } })} label="Maximum past orders" />
          </Field>
        </div>
      )}
    </div>
  );
}

/** datetime-local (India time) <-> ISO with +05:30 */
const toLocal = (iso?: string) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? `${v}:00+05:30` : undefined);

function LimitsStep({ d, set }: StepProps) {
  const l = d.limits;
  const setL = (patch: Partial<Draft['limits']>) => set({ limits: { ...l, ...patch } });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Checkbox checked={l.totalUses !== undefined} onChange={(on) => setL({ totalUses: on ? 100 : undefined })} label="Limit total uses" />
          {l.totalUses !== undefined && <div className="mt-2"><NumberInput value={l.totalUses} min={1} onChange={(n) => setL({ totalUses: n })} label="Total uses" /></div>}
        </div>
        <div>
          <Checkbox checked={l.perShopper !== undefined} onChange={(on) => setL({ perShopper: on ? 1 : undefined })} label="Limit uses per customer" />
          {l.perShopper !== undefined && <div className="mt-2"><NumberInput value={l.perShopper} min={1} onChange={(n) => setL({ perShopper: n })} label="Uses per customer" /></div>}
        </div>
      </div>
      <Checkbox checked={l.combinable} onChange={(v) => setL({ combinable: v })} label="Combine with other discounts" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts (India time, optional)">
          <input className="input" type="datetime-local" value={toLocal(l.startsAt)} onChange={(e) => setL({ startsAt: fromLocal(e.target.value) })} />
        </Field>
        <Field label="Ends (optional)">
          <input className="input" type="datetime-local" value={toLocal(l.endsAt)} onChange={(e) => setL({ endsAt: fromLocal(e.target.value) })} />
        </Field>
      </div>
      {d.kind !== 'payment_offer' && (
        <div className="space-y-2 rounded-lg border border-ink-line p-3">
          <Checkbox checked={l.disableCod} onChange={(v) => setL({ disableCod: v })} label="Disable Cash on delivery when this offer applies (prepaid only)" />
          <Checkbox checked={l.disablePartialCod} onChange={(v) => setL({ disablePartialCod: v })} label="Disable partial COD when this offer applies" />
        </div>
      )}
    </div>
  );
}

function PreviewStep({ d, set, core }: StepProps & { core: CoreCoupon | null }) {
  const suggestion = core ? couponDetails(core) : [];
  return (
    <div className="space-y-5">
      <label className="flex items-center gap-3 text-sm">
        <Toggle checked={d.visible} onChange={(v) => set({ visible: v })} label="Show to shoppers" /> Show this coupon in the coupon list to shoppers
      </label>
      <Field label="Custom title (optional)" hint={core ? `Empty = "${couponHeadline(core)}"` : undefined}>
        <input className="input" value={d.title ?? ''} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Custom details (one per line, optional)">
        <textarea className="input h-28" value={d.details.join('\n')} onChange={(e) => set({ details: e.target.value.split('\n').map((x) => x.slice(0, 120)).slice(0, 6) })} />
      </Field>
      {suggestion.length > 0 && (
        <div className="rounded-lg bg-ink-soft p-3 text-sm">
          <div className="mb-1 font-medium">Suggested details</div>
          <ul className="list-disc pl-5 text-ink-2">{suggestion.map((s) => <li key={s}>{s}</li>)}</ul>
          <button className="mt-2 text-sm font-semibold text-brand-600" onClick={() => set({ details: suggestion })}>Use suggestion</button>
        </div>
      )}
    </div>
  );
}

/** What the shopper sees in the coupon list. */
function ShopperCard({ d, core }: { d: Draft; core: CoreCoupon }) {
  const [open, setOpen] = useState(false);
  const details = d.details.filter(Boolean).length ? d.details.filter(Boolean) : couponDetails(core);
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Shopper sees</div>
      <div className="mt-3 rounded-xl border border-dashed border-ink-line p-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-green-50 text-green-700">%</span>
          <div className="flex-1">
            <div className="font-semibold">{d.title || couponHeadline(core)}</div>
            {d.code && <span className="chip mt-1 border border-dashed border-ink-line">{d.code}</span>}
            {details.length > 0 && (
              <button className="mt-1 block text-xs text-ink-3" onClick={() => setOpen((o) => !o)}>{open ? 'Hide details' : 'Show details'}</button>
            )}
            {open && <ul className="mt-1 list-disc pl-4 text-xs text-ink-2">{details.map((x) => <li key={x}>{x}</li>)}</ul>}
          </div>
          <span className="text-sm font-bold text-brand-600">APPLY</span>
        </div>
      </div>
      {!d.visible && <p className="mt-2 text-xs text-ink-3">Hidden from the list: {d.automatic ? 'it still applies by itself.' : 'only people who know the code can use it.'}</p>}
    </div>
  );
}
