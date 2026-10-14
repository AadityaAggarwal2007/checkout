'use client';
import { GATEWAYS, ONLINE_METHOD_LABELS, type GatewayProviderKey, type GatewayView, type PaymentSettings, type PaymentsResponse } from '@checkout/shared/payments';
import { useCallback, useEffect, useState } from 'react';
import { Field, Section, Select, Toggle } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { toPaise, toRupeesText } from '@/lib/money';
import { useStore } from '@/lib/store-context';

export default function Payments() {
  const { store, role } = useStore();
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [denied, setDenied] = useState(false);
  const base = `/api/stores/${store.id}`;
  const load = useCallback(
    () =>
      api<PaymentsResponse>(`${base}/payments`).then(setData, (e) => {
        if (e instanceof ApiError && e.status === 403) setDenied(true);
      }),
    [base],
  );
  useEffect(() => void load(), [load]);

  if (denied) return <p className="mx-auto max-w-3xl text-ink-3">Only the store owner or an admin can change payment settings.</p>;
  if (!data) return <p className="text-ink-3">Loading…</p>;
  const shopUrl = `${store.domain?.startsWith('localhost') ? 'http' : 'https'}://${store.domain ?? store.shopDomain}`;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-ink-3">Your own payment gateway, Cash on delivery and partial COD. Keys are stored encrypted and never shown again.</p>
      </div>
      <SettingsCard initial={data.settings} base={base} onSaved={setData} testUrl={`${shopUrl}/?ck_test=${data.testKey}`} canEdit={role === 'OWNER' || role === 'ADMIN'} />
      {data.available.map((p) => (
        <GatewayCard key={p} provider={p} view={data.gateways.find((g) => g.provider === p)} base={base} onSaved={setData} />
      ))}
      <RoutesCard data={data} base={base} onSaved={setData} />
    </div>
  );
}

async function save<T>(work: () => Promise<T>, ok: string): Promise<T | null> {
  try {
    const out = await work();
    toast(ok);
    return out;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Something went wrong.', 'err');
    return null;
  }
}

function SettingsCard({ initial, base, onSaved, testUrl, canEdit }: { initial: PaymentSettings; base: string; onSaved: (d: PaymentsResponse) => void; testUrl: string; canEdit: boolean }) {
  const [s, setS] = useState(initial);
  const [fee, setFee] = useState(toRupeesText(initial.codFee));
  const [amount, setAmount] = useState(toRupeesText(initial.partialCod.amount));
  const [min, setMin] = useState(initial.partialCod.min === null ? '' : toRupeesText(initial.partialCod.min));
  const [max, setMax] = useState(initial.partialCod.max === null ? '' : toRupeesText(initial.partialCod.max));
  const pc = s.partialCod;
  const set = (patch: Partial<PaymentSettings>) => setS((x) => ({ ...x, ...patch }));
  const setPc = (patch: Partial<PaymentSettings['partialCod']>) => setS((x) => ({ ...x, partialCod: { ...x.partialCod, ...patch } }));

  async function submit(next = s) {
    const codFee = toPaise(fee || '0');
    const pAmount = toPaise(amount || '0');
    const pMin = min.trim() ? toPaise(min) : null;
    const pMax = max.trim() ? toPaise(max) : null;
    if (codFee === null || pAmount === null || (min.trim() && pMin === null) || (max.trim() && pMax === null)) return toast('Amounts must be in rupees, like 49 or 49.50', 'err');
    const out = await save(() => api<PaymentsResponse>(`${base}/payments/settings`, { method: 'PUT', body: { ...next, codFee, partialCod: { ...next.partialCod, amount: pAmount, min: pMin, max: pMax } } }), 'Saved');
    if (out) {
      onSaved(out);
      setS(out.settings);
    }
  }

  return (
    <>
      <Section
        title="Our checkout on your store"
        description={s.checkoutEnabled ? 'Shoppers check out here (drawer, cart page and Buy it now).' : 'Off: shoppers use the Shopify checkout.'}
        right={<Toggle checked={s.checkoutEnabled} disabled={!canEdit} label="Checkout on" onChange={(v) => void submit({ ...s, checkoutEnabled: v })} />}
      >
        <p className="break-all text-[13px] text-ink-3">
          Test it before switching on — only people with this link see it:{' '}
          <a className="font-medium text-brand-600 underline" href={testUrl} target="_blank" rel="noreferrer">
            {testUrl}
          </a>
        </p>
      </Section>
      <Section title="Cash on delivery" right={<Toggle checked={s.codEnabled} label="COD" onChange={(v) => set({ codEnabled: v })} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="COD charge (₹)" hint="Added only when the shopper picks COD. 0 = none.">
            <input className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
          <Field label="Confirm before placing a COD order" hint="A popup that also offers to pay online and save.">
            <div className="pt-1">
              <Toggle checked={s.codConfirmPopup} label="COD confirmation" onChange={(v) => set({ codConfirmPopup: v })} />
            </div>
          </Field>
        </div>
      </Section>
      <Section title="Partial COD" description="Shopper pays a part now (online) and the rest on delivery. Cuts fake COD orders." right={<Toggle checked={pc.enabled} label="Partial COD" onChange={(v) => setPc({ enabled: v })} />}>
        {pc.enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pay now as">
              <Select value={pc.type} onChange={(v) => setPc({ type: v })} options={[['fixed', 'Fixed amount (₹)'], ['percent', 'Percent of the order']]} />
            </Field>
            {pc.type === 'fixed' ? (
              <Field label="Amount to pay now (₹)">
                <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            ) : (
              <Field label="Percent to pay now">
                <input className="input" inputMode="decimal" value={pc.percent || ''} onChange={(e) => setPc({ percent: Number(e.target.value) || 0 })} />
              </Field>
            )}
            <Field label="At least (₹, optional)">
              <input className="input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
            </Field>
            <Field label="At most (₹, optional)">
              <input className="input" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
            </Field>
          </div>
        )}
      </Section>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => void submit()}>Save COD settings</button>
      </div>
    </>
  );
}

function GatewayCard({ provider, view, base, onSaved }: { provider: GatewayProviderKey; view?: GatewayView; base: string; onSaved: (d: PaymentsResponse) => void }) {
  const def = GATEWAYS[provider];
  const [mode, setMode] = useState<'test' | 'live'>(view?.mode ?? 'test');
  const [active, setActive] = useState(view?.active ?? true);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(def.fields.filter((f) => !f.secret && !f.multiline).map((f) => [f.key, view?.publicInfo[f.key] ?? ''])));
  const [open, setOpen] = useState(!view);
  const status = !view ? ['Not added', 'bg-ink-soft text-ink-3'] : !view.active ? ['Off', 'bg-ink-soft text-ink-3'] : view.mode === 'live' ? ['Live', 'bg-green-100 text-green-700'] : ['Test mode', 'bg-amber-100 text-amber-700'];

  async function submit() {
    const out = await save(() => api<PaymentsResponse>(`${base}/gateways/${provider.toLowerCase()}`, { method: 'PUT', body: { mode, active, credentials: values } }), `${def.name} saved`);
    if (out) {
      onSaved(out);
      setValues((v) => Object.fromEntries(Object.entries(v).filter(([k]) => !def.fields.find((f) => f.key === k)?.secret)));
      setOpen(false);
    }
  }

  return (
    <Section
      title={def.name}
      description={provider === 'DEV' ? 'Local test gateway: Pay / Fail buttons, no money. Only on a local server.' : 'Payments go straight to your own account.'}
      right={
        <div className="flex items-center gap-2">
          <span className={`chip ${status[1]}`}>{status[0]}</span>
          <button className="btn-secondary" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : view ? 'Edit' : 'Add'}</button>
        </div>
      }
    >
      {open && (
        <div className="space-y-4">
          {def.fields.map((f) => {
            const saved = view && (f.secret ? view.secretsSet.includes(f.key) : !!view.publicInfo[f.key]);
            const placeholder = saved ? (f.secret || f.multiline ? 'Saved — paste again only to replace' : '') : '';
            return (
              <Field key={f.key} label={f.label} hint={f.help}>
                {f.multiline ? (
                  <textarea className="input h-24 font-mono text-xs" placeholder={placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                ) : (
                  <input className="input" type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                )}
              </Field>
            );
          })}
          <div className="flex flex-wrap items-center gap-6">
            <Field label="Mode">
              <Select value={mode} onChange={setMode} options={[['test', 'Test (sandbox)'], ['live', 'Live (real money)']]} />
            </Field>
            <label className="flex items-center gap-2 pt-5 text-sm">
              <Toggle checked={active} onChange={setActive} label="Use this gateway" /> Use this gateway
            </label>
          </div>
          {view && provider !== 'DEV' && (
            <p className="text-[13px] text-ink-3">
              Webhook / notification URL for the {def.name} dashboard: <code className="rounded bg-ink-soft px-1.5 py-0.5">{view.webhookUrl}</code>
            </p>
          )}
          <div className="flex justify-between">
            {view ? (
              <button className="btn-danger" onClick={() => confirm(`Remove ${def.name}? Its keys are deleted.`) && void save(() => api<PaymentsResponse>(`${base}/gateways/${provider.toLowerCase()}`, { method: 'DELETE' }), 'Removed').then((d) => d && onSaved(d))}>
                Remove
              </button>
            ) : (
              <span />
            )}
            <button className="btn-primary" onClick={() => void submit()}>Save {def.name}</button>
          </div>
        </div>
      )}
    </Section>
  );
}

function RoutesCard({ data, base, onSaved }: { data: PaymentsResponse; base: string; onSaved: (d: PaymentsResponse) => void }) {
  const [routes, setRoutes] = useState<Record<string, string>>(data.routes);
  if (data.gateways.length < 2) return null; // one gateway takes every method automatically
  const options: Array<[string, string]> = [['', 'Automatic'], ...data.gateways.map((g) => [g.provider, g.name] as [string, string])];
  return (
    <Section title="Which gateway takes which method" description="Leave Automatic to use your first active gateway for everything.">
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(ONLINE_METHOD_LABELS).map(([m, label]) => (
          <Field key={m} label={label}>
            <Select value={routes[m] ?? ''} onChange={(v) => setRoutes((r) => ({ ...r, [m]: v }))} options={options} />
          </Field>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          className="btn-primary"
          onClick={() =>
            void save(() => api<PaymentsResponse>(`${base}/payment-routes`, { method: 'PUT', body: { routes: Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, v || null])) } }), 'Saved').then((d) => d && onSaved(d))
          }
        >
          Save routing
        </button>
      </div>
    </Section>
  );
}
