'use client';
import { CHECKOUT_METHODS, checkoutSettingsSchema, type CheckoutSettings } from '@checkout/shared';
import { METHOD_LABELS } from '@checkout/shared/payments';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ColorInput, Field, Radio, Select, TextInput, Toggle } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/lib/store-context';

type Tab = 'general' | 'login' | 'address' | 'payment' | 'exit';
const TABS: Array<[Tab, string]> = [
  ['general', 'General'],
  ['login', 'Login'],
  ['address', 'Address'],
  ['payment', 'Payments'],
  ['exit', 'Exit popup'],
];
type Method = (typeof CHECKOUT_METHODS)[number];

export default function CheckoutDesign() {
  const { store, role } = useStore();
  const readOnly = !(role === 'OWNER' || role === 'ADMIN');
  const url = `/api/stores/${store.id}/checkout-design`;
  const [saved, setSaved] = useState<CheckoutSettings | null>(null);
  const [answers, setAnswers] = useState<Array<{ reason: string; count: number }>>([]);
  const [d, setD] = useState<CheckoutSettings | null>(null);
  const [tab, setTab] = useState<Tab>('general');
  const [saving, setSaving] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    api<{ settings: CheckoutSettings; exitAnswers: Array<{ reason: string; count: number }> }>(url).then((r) => {
      setAnswers(r.exitAnswers);
      setSaved(r.settings);
      setD(r.settings);
    });
  }, [url]);

  const check = d ? checkoutSettingsSchema.safeParse(d) : null;
  const step = tab === 'general' ? 'payment' : tab;
  const sendPreview = useCallback(() => {
    if (check?.success) frame.current?.contentWindow?.postMessage({ type: 'ck:design', settings: check.data, step, storeName: store.name }, window.location.origin);
  }, [check, step, store.name]);
  useEffect(sendPreview, [sendPreview]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => e.origin === window.location.origin && e.data?.type === 'ck:preview-ready' && sendPreview();
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [sendPreview]);

  if (!d || !saved) return <p className="text-ink-3">Loading…</p>;
  const dirty = JSON.stringify(saved) !== JSON.stringify(d);
  const set = (patch: Partial<CheckoutSettings>) => setD((x) => (x ? { ...x, ...patch } : x));

  async function save() {
    if (!check?.success) return toast(check?.error.issues[0]?.message ?? 'Check the settings.', 'err');
    setSaving(true);
    try {
      const r = await api<{ settings: CheckoutSettings }>(url, { method: 'PUT', body: check.data });
      setSaved(r.settings);
      setD(r.settings);
      toast('Saved — live in your checkout');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
    } finally {
      setSaving(false);
    }
  }

  const order = [...d.methodOrder, ...CHECKOUT_METHODS.filter((m) => !d.methodOrder.includes(m))];
  const move = (m: Method, by: number) => {
    const i = order.indexOf(m);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    set({ methodOrder: next });
  };
  const banner = (k: 'login' | 'address' | 'payment', hint: string) => (
    <Field label="Banner on top of this step" hint={hint} count={[d.banners[k]?.length ?? 0, 120]}>
      <TextInput value={d.banners[k] ?? ''} max={120} placeholder="e.g. Free delivery on prepaid orders" onChange={(v) => set({ banners: { ...d.banners, [k]: v || undefined } })} />
    </Field>
  );

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Checkout design</h1>
          <p className="text-ink-3">How your one-page checkout looks. The preview on the right uses sample items.</p>
        </div>
        {dirty && <span className="text-sm text-amber-600">Unsaved changes</span>}
        <button className="btn-secondary" disabled={!dirty || saving} onClick={() => setD(saved)}>Discard</button>
        <button className="btn-primary" data-test="save-design" disabled={!dirty || saving || readOnly} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <nav className="flex gap-1 overflow-x-auto rounded-xl border border-ink-line bg-white p-1">
            {TABS.map(([k, label]) => (
              <button key={k} data-test={`tab-${k}`} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-ink text-white' : 'text-ink-2 hover:bg-ink-soft'}`}>
                {label}
              </button>
            ))}
          </nav>
          <fieldset disabled={readOnly} className="card space-y-4 p-5">
            {tab === 'general' && (
              <>
                <Field label="Logo URL" hint="An https:// link to your logo (PNG or SVG). Empty = your store name.">
                  <TextInput value={d.logoUrl ?? ''} max={500} placeholder="https://cdn.shopify.com/…/logo.png" onChange={(v) => set({ logoUrl: v.trim() || undefined })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <ColorInput label="Buttons" value={d.colors.primary} onChange={(primary) => set({ colors: { ...d.colors, primary } })} />
                  <ColorInput label="Button text" value={d.colors.primaryText} onChange={(primaryText) => set({ colors: { ...d.colors, primaryText } })} />
                  <ColorInput label="Savings / success" value={d.colors.accent} onChange={(accent) => set({ colors: { ...d.colors, accent } })} />
                </div>
              </>
            )}
            {tab === 'login' && banner('login', 'Shown above the mobile number. The shopper verifies with a WhatsApp code.')}
            {tab === 'address' && (
              <>
                {banner('address', 'Shown above the address form.')}
                <Field label="Email on the address form">
                  <Select value={d.askEmail} onChange={(askEmail) => set({ askEmail })} options={[['hidden', 'Do not ask'], ['optional', 'Optional'], ['required', 'Required']]} />
                </Field>
              </>
            )}
            {tab === 'payment' && (
              <>
                {banner('payment', 'Shown above the payment methods.')}
                <div>
                  <span className="label">Payment methods: order, names, show / hide</span>
                  <p className="hint mb-2">Only methods your gateways support appear for shoppers. COD also follows your RTO rules and shipping.</p>
                  <div className="divide-y divide-ink-line rounded-lg border border-ink-line">
                    {order.map((m, i) => {
                      const hidden = d.hiddenMethods.includes(m);
                      return (
                        <div key={m} className="flex flex-wrap items-center gap-2 px-3 py-2" data-test={`method-${m}`}>
                          <div className="flex flex-col">
                            <button type="button" className="text-xs text-ink-3 disabled:opacity-30" disabled={i === 0} aria-label={`Move ${m} up`} onClick={() => move(m, -1)}>▲</button>
                            <button type="button" className="text-xs text-ink-3 disabled:opacity-30" disabled={i === order.length - 1} aria-label={`Move ${m} down`} onClick={() => move(m, 1)}>▼</button>
                          </div>
                          <span className="w-36 text-sm font-medium">{METHOD_LABELS[m]}</span>
                          <input className="input min-w-40 flex-1" maxLength={30} placeholder={`Name shown (default: ${METHOD_LABELS[m]})`} value={d.methodLabels[m] ?? ''} onChange={(e) => {
                              const labels = { ...d.methodLabels };
                              if (e.target.value) labels[m] = e.target.value;
                              else delete labels[m];
                              set({ methodLabels: labels });
                            }} />
                          <Toggle checked={!hidden} label={`Show ${METHOD_LABELS[m]}`} onChange={(on) => set({ hiddenMethods: on ? d.hiddenMethods.filter((x) => x !== m) : [...d.hiddenMethods, m] })} />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block font-medium">Trust badges</span>
                    <span className="text-sm text-ink-3">"100% secure payment · Encrypted & safe · Verified with OTP" under the methods.</span>
                  </span>
                  <Toggle checked={d.trustBadges} label="Trust badges" onChange={(trustBadges) => set({ trustBadges })} />
                </label>
              </>
            )}
            {tab === 'exit' && (
              <>
                <Radio
                  value={d.exit.mode}
                  onChange={(mode) => set({ exit: { ...d.exit, mode } })}
                  options={[
                    ['savings', 'Savings reminder', 'Shows how much they save on this order (or your message when there is no saving).'],
                    ['default', 'Your message', 'A short message asking them to finish.'],
                    ['survey', 'Exit survey', 'Asks why they are leaving; answers show in your dashboard.'],
                    ['off', 'Off', 'Closing the checkout just closes it.'],
                  ]}
                />
                {(d.exit.mode === 'savings' || d.exit.mode === 'default') && (
                  <>
                    <Field label="Title" count={[d.exit.title.length, 60]}>
                      <TextInput value={d.exit.title} max={60} onChange={(title) => set({ exit: { ...d.exit, title } })} />
                    </Field>
                    <Field label="Message" count={[d.exit.text.length, 160]}>
                      <TextInput value={d.exit.text} max={160} onChange={(text) => set({ exit: { ...d.exit, text } })} />
                    </Field>
                  </>
                )}
                {d.exit.mode === 'survey' && (
                  <Field label="Reasons (one per line, 2 to 6)">
                    <textarea className="input min-h-36" value={d.exit.reasons.join('\n')} onChange={(e) => set({ exit: { ...d.exit, reasons: e.target.value.split('\n').map((r) => r.slice(0, 40)).slice(0, 6) } })} />
                  </Field>
                )}
                {answers.length > 0 && (
                  <div>
                    <span className="label">Survey answers, last 30 days</span>
                    <div className="space-y-1">
                      {answers.map((a) => (
                        <div key={a.reason} className="flex justify-between rounded-lg bg-ink-soft px-3 py-1.5 text-sm">
                          <span>{a.reason}</span>
                          <b>{a.count}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {check && !check.success && <p className="text-sm text-red-600">{check.error.issues[0]?.path.join(' › ')}: {check.error.issues[0]?.message}</p>}
          </fieldset>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Live preview</div>
          <iframe ref={frame} title="Checkout preview" src="/checkout/preview" className="h-[720px] w-full rounded-2xl border border-ink-line bg-white shadow-card" />
        </div>
      </div>
    </div>
  );
}
