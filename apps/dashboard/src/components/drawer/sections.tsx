'use client';
import { TRUST_BADGES, type DrawerSettings } from '@checkout/shared';
import { ProductPicker } from '@/components/product-picker';
import { Checkbox, ColorInput, Field, Section, Select, TextInput, Toggle } from '@/components/ui/fields';
import { toPaise, toRupeesText } from '@/lib/money';

export type SectionKey = keyof Omit<DrawerSettings, 'colors'>;
type Edit = <K extends keyof DrawerSettings>(key: K, patch: Partial<DrawerSettings[K]>) => void;
interface Props {
  d: DrawerSettings;
  edit: Edit;
  storeId: string;
}

export const SECTIONS: Array<{ key: SectionKey; label: string; icon: string }> = [
  { key: 'announcements', label: 'Announcements', icon: '📣' },
  { key: 'timer', label: 'Hurry timer', icon: '⏱' },
  { key: 'rewardBar', label: 'Reward bar', icon: '☆' },
  { key: 'upsells', label: 'Upsells', icon: '👍' },
  { key: 'addons', label: 'Add-ons', icon: '＋' },
  { key: 'notes', label: 'Additional notes', icon: '📝' },
  { key: 'confirmation', label: 'Confirmation text', icon: '☑' },
  { key: 'discountCodes', label: 'Discount codes', icon: '%' },
  { key: 'trustBadges', label: 'Trust badges', icon: '🛡' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

/** Whether the section shows as "Active" in the list. */
export function isOn(d: DrawerSettings, key: SectionKey): boolean | null {
  const v = d[key] as { enabled?: boolean };
  return typeof v.enabled === 'boolean' ? v.enabled : null;
}

function Enable({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title: string }) {
  return <Section title={`Enable ${title}`} right={<Toggle checked={on} onChange={onChange} label={`Enable ${title}`} />} />;
}

export function SectionEditor({ k, ...p }: Props & { k: SectionKey }) {
  switch (k) {
    case 'announcements':
      return <Announcements {...p} />;
    case 'timer':
      return <Timer {...p} />;
    case 'rewardBar':
      return <RewardBar {...p} />;
    case 'upsells':
      return <Upsells {...p} />;
    case 'addons':
      return <Addons {...p} />;
    case 'notes':
      return <Notes {...p} />;
    case 'confirmation':
      return <Confirmation {...p} />;
    case 'discountCodes':
      return <DiscountCodes {...p} />;
    case 'trustBadges':
      return <TrustBadges {...p} />;
    case 'settings':
      return <Settings {...p} />;
  }
}

function Timer({ d, edit }: Props) {
  const t = d.timer;
  return (
    <>
      <Enable on={t.enabled} onChange={(enabled) => edit('timer', { enabled })} title="the timer" />
      <Section title="Configuration" description='Shows "Hurry! 03Min : 58Sec" under the bag title. It counts down from when the shopper opens the bag and starts again at zero.'>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Text" count={[t.text.length, 20]}>
            <TextInput value={t.text} max={20} onChange={(text) => edit('timer', { text })} />
          </Field>
          <Field label="Minutes">
            <TextInput value={String(t.minutes)} max={2} onChange={(v) => edit('timer', { minutes: Math.min(60, Math.max(1, Number(v.replace(/\D/g, '')) || 1)) })} />
          </Field>
        </div>
      </Section>
    </>
  );
}

function Announcements({ d, edit }: Props) {
  const a = d.announcements;
  const set = (messages: string[]) => edit('announcements', { messages });
  return (
    <>
      <Enable on={a.enabled} onChange={(enabled) => edit('announcements', { enabled })} title="announcements" />
      <Section title="Configuration">
        <Field label="Mode">
          <Select value={a.mode} onChange={(mode) => edit('announcements', { mode })} options={[['rotate', 'Rotating messages'], ['marquee', 'Scrolling marquee'], ['static', 'Single message']]} />
        </Field>
      </Section>
      <Section title="Messages" right={<button className="btn-secondary" disabled={a.messages.length >= 10} onClick={() => set([...a.messages, ''])}>Add message</button>}>
        {a.messages.map((m, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <Field label={`Message ${i + 1}`} count={[m.length, 50]}>
                <TextInput value={m} max={50} onChange={(v) => set(a.messages.map((x, j) => (j === i ? v : x)))} />
              </Field>
            </div>
            <button className="btn-danger px-3" aria-label={`Delete message ${i + 1}`} onClick={() => set(a.messages.filter((_, j) => j !== i))}>🗑</button>
          </div>
        ))}
        <Field label="Display duration (seconds)" hint="How long each message shows.">
          <input className="input w-32" type="number" min={2} max={20} value={a.durationSec} onChange={(e) => edit('announcements', { durationSec: Math.min(20, Math.max(2, Number(e.target.value) || 3)) })} />
        </Field>
      </Section>
    </>
  );
}

function RewardBar({ d, edit }: Props) {
  const r = d.rewardBar;
  const tiers = r.tiers;
  const setTiers = (t: typeof tiers) => edit('rewardBar', { tiers: t });
  const isValue = r.counting === 'value';
  return (
    <>
      <Enable on={r.enabled} onChange={(enabled) => edit('rewardBar', { enabled })} title="reward bar" />
      <Section title="Configuration">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template">
            <Select value={r.template} onChange={(template) => edit('rewardBar', { template })} options={[['icons', 'With icons'], ['simple', 'Simple bar']]} />
          </Field>
          <Field label="Counting method">
            <Select value={r.counting} onChange={(counting) => edit('rewardBar', { counting })} options={[['value', 'Cart value'], ['quantity', 'Item count']]} />
          </Field>
        </div>
        <Checkbox checked={r.confetti} onChange={(confetti) => edit('rewardBar', { confetti })} label="Confetti when a tier is reached" />
      </Section>
      <Section
        title="Reward tiers"
        description="Up to 6 milestones. Free gifts themselves are set in Coupons (free gift)."
        right={<button className="btn-secondary" disabled={tiers.length >= 6} onClick={() => setTiers([...tiers, { id: `t${Date.now()}`, label: 'Free gift', threshold: isValue ? 99900 : 3, kind: 'gift' }])}>+ Add tier</button>}
      >
        {tiers.map((t, i) => (
          <div key={t.id} className="grid grid-cols-[1fr_120px_120px_auto] items-end gap-2">
            <Field label="Label">
              <TextInput value={t.label} max={30} onChange={(label) => setTiers(tiers.map((x, j) => (j === i ? { ...x, label } : x)))} />
            </Field>
            <Field label={isValue ? 'At ₹' : 'At items'}>
              <input
                className="input"
                inputMode="decimal"
                defaultValue={isValue ? toRupeesText(t.threshold) : String(t.threshold)}
                onBlur={(e) => {
                  const v = isValue ? toPaise(e.target.value) : Number.parseInt(e.target.value, 10);
                  if (v !== null && Number.isFinite(v) && v >= 0) setTiers(tiers.map((x, j) => (j === i ? { ...x, threshold: v } : x)));
                }}
              />
            </Field>
            <Field label="Type">
              <Select value={t.kind} onChange={(kind) => setTiers(tiers.map((x, j) => (j === i ? { ...x, kind } : x)))} options={[['shipping', 'Shipping'], ['gift', 'Gift'], ['discount', 'Discount']]} />
            </Field>
            <button className="btn-danger mb-0.5 px-3" aria-label="Delete tier" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>🗑</button>
          </div>
        ))}
      </Section>
    </>
  );
}

function Upsells({ d, edit, storeId }: Props) {
  const u = d.upsells;
  return (
    <>
      <Enable on={u.enabled} onChange={(enabled) => edit('upsells', { enabled })} title="upsells" />
      <Section title="Configuration">
        <Field label="Title" hint="Shown above the upsell products." count={[u.title.length, 30]}>
          <TextInput value={u.title} max={30} onChange={(title) => edit('upsells', { title })} />
        </Field>
        <Field label="Select products">
          <ProductPicker storeId={storeId} value={u.productIds} onChange={(productIds) => edit('upsells', { productIds })} />
        </Field>
        <Field label="Maximum upsells to show">
          <input className="input w-32" type="number" min={1} max={30} value={u.max} onChange={(e) => edit('upsells', { max: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })} />
        </Field>
        <p className="hint">Products already in the cart are not shown again. Rule-based upsells (with timer and discount) come in the Upsell section.</p>
      </Section>
    </>
  );
}

function Addons({ d, edit }: Props) {
  return (
    <>
      <Enable on={d.addons.enabled} onChange={(enabled) => edit('addons', { enabled })} title="add-ons" />
      <Section title="Add-on rules" description="Offer a small extra (gift wrap, warranty…) when certain products are in the cart.">
        <div className="rounded-lg border border-dashed border-ink-line p-6 text-center text-ink-3">The add-on rule builder comes with the Upsell section (Phase 4).</div>
      </Section>
    </>
  );
}

function Notes({ d, edit }: Props) {
  const n = d.notes;
  return (
    <>
      <Enable on={n.enabled} onChange={(enabled) => edit('notes', { enabled })} title="additional notes" />
      <Section title="Configuration">
        <Field label="Position">
          <Select value={n.position} onChange={(position) => edit('notes', { position })} options={[['body', 'Body'], ['footer', 'Footer']]} />
        </Field>
        <Field label="Title" count={[n.title.length, 30]}>
          <TextInput value={n.title} max={30} onChange={(title) => edit('notes', { title })} />
        </Field>
        <Field label="Placeholder" count={[n.placeholder.length, 30]}>
          <TextInput value={n.placeholder} max={30} onChange={(placeholder) => edit('notes', { placeholder })} />
        </Field>
        <Field label="Maximum length (characters)">
          <input className="input w-32" type="number" min={20} max={1000} value={n.maxLength} onChange={(e) => edit('notes', { maxLength: Math.min(1000, Math.max(20, Number(e.target.value) || 300)) })} />
        </Field>
      </Section>
    </>
  );
}

function Confirmation({ d, edit }: Props) {
  const c = d.confirmation;
  return (
    <>
      <Enable on={c.enabled} onChange={(enabled) => edit('confirmation', { enabled })} title="confirmation text" />
      <Section title="Configuration">
        <Field label="Content" hint="The text to display for confirmation." count={[c.text.length, 100]}>
          <textarea className="input min-h-20" maxLength={100} value={c.text} onChange={(e) => edit('confirmation', { text: e.target.value })} />
        </Field>
        <div className="flex gap-8">
          <Checkbox checked={c.checkbox} onChange={(checkbox) => edit('confirmation', { checkbox })} label="Enable checkbox" />
          <Checkbox checked={c.required} onChange={(required) => edit('confirmation', { required })} label="Required checkbox" />
        </div>
      </Section>
    </>
  );
}

function DiscountCodes({ d, edit }: Props) {
  const c = d.discountCodes;
  return (
    <>
      <Enable on={c.enabled} onChange={(enabled) => edit('discountCodes', { enabled })} title="discount codes" />
      <Section title="Configuration" description="Which codes exist and what they give is set in Coupons; codes marked visible appear as chips.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Input placeholder" count={[c.placeholder.length, 30]}>
            <TextInput value={c.placeholder} max={30} onChange={(placeholder) => edit('discountCodes', { placeholder })} />
          </Field>
          <Field label="Apply button text" count={[c.applyText.length, 10]}>
            <TextInput value={c.applyText} max={10} onChange={(applyText) => edit('discountCodes', { applyText })} />
          </Field>
        </div>
        <Field label="Applied message">
          <TextInput value={c.appliedMessage} max={80} onChange={(appliedMessage) => edit('discountCodes', { appliedMessage })} />
        </Field>
        <Checkbox checked={c.confetti} onChange={(confetti) => edit('discountCodes', { confetti })} label="Confetti when a code applies" />
      </Section>
    </>
  );
}

function TrustBadges({ d, edit }: Props) {
  const t = d.trustBadges;
  const toggle = (b: (typeof TRUST_BADGES)[number]) =>
    edit('trustBadges', { badges: t.badges.includes(b) ? t.badges.filter((x) => x !== b) : t.badges.length < 8 ? [...t.badges, b] : t.badges });
  return (
    <>
      <Enable on={t.enabled} onChange={(enabled) => edit('trustBadges', { enabled })} title="trust badges" />
      <Section title="Badges" description="Pick up to 8; the first 5 show under the Checkout button, in this order.">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {TRUST_BADGES.map((b) => {
            const i = t.badges.indexOf(b);
            return (
              <button key={b} type="button" onClick={() => toggle(b)} className={`relative rounded-lg border px-3 py-3 text-xs font-semibold uppercase ${i >= 0 ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-line text-ink-2 hover:bg-ink-soft'}`}>
                {b.replace('_', ' ')}
                {i >= 0 && <span className="absolute right-1.5 top-1 text-[10px]">{i + 1}</span>}
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function Settings({ d, edit }: Props) {
  const s = d.settings;
  return (
    <>
      <Section title="Display settings">
        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox checked={s.showCompareAt} onChange={(showCompareAt) => edit('settings', { showCompareAt })} label="Show compare-at price" />
          <Checkbox checked={s.showSavings} onChange={(showSavings) => edit('settings', { showSavings })} label="Show savings" />
          <Checkbox checked={s.showVariantSelector} onChange={(showVariantSelector) => edit('settings', { showVariantSelector })} label="Show variant selector" />
          <Checkbox checked={s.showProperties} onChange={(showProperties) => edit('settings', { showProperties })} label="Show properties" />
          <Checkbox checked={s.openOnAdd} onChange={(openOnAdd) => edit('settings', { openOnAdd })} label="Open drawer on add to cart" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Checkout button text" count={[s.checkoutText.length, 30]}>
            <TextInput value={s.checkoutText} max={30} onChange={(checkoutText) => edit('settings', { checkoutText })} />
          </Field>
          <Field label="Tag on the button" hint='Like "Limited Offer"; empty = none' count={[s.buttonTag.length, 20]}>
            <TextInput value={s.buttonTag} max={20} onChange={(buttonTag) => edit('settings', { buttonTag })} />
          </Field>
        </div>
      </Section>
      <Section title="Empty cart state">
        <Field label="Title" count={[s.emptyTitle.length, 30]}>
          <TextInput value={s.emptyTitle} max={30} onChange={(emptyTitle) => edit('settings', { emptyTitle })} />
        </Field>
        <Field label="Description" count={[s.emptyDescription.length, 60]}>
          <TextInput value={s.emptyDescription} max={60} onChange={(emptyDescription) => edit('settings', { emptyDescription })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Button text" count={[s.emptyButtonText.length, 25]}>
            <TextInput value={s.emptyButtonText} max={25} onChange={(emptyButtonText) => edit('settings', { emptyButtonText })} />
          </Field>
          <Field label="Button URL" hint="A path like /collections/all">
            <TextInput value={s.emptyButtonUrl} max={200} onChange={(emptyButtonUrl) => edit('settings', { emptyButtonUrl })} />
          </Field>
        </div>
      </Section>
      <Section title="Theme" description="Only change this if the theme's cart count does not update.">
        <Field label="Cart count class name">
          <TextInput value={s.cartCountClass} max={60} onChange={(cartCountClass) => edit('settings', { cartCountClass })} />
        </Field>
      </Section>
    </>
  );
}

export function Colors({ d, edit }: Props) {
  return (
    <section className="card space-y-3 p-4">
      <h3 className="text-sm font-semibold">Color palette</h3>
      <ColorInput label="Primary color" value={d.colors.primary} onChange={(primary) => edit('colors', { primary })} />
      <ColorInput label="Button text" value={d.colors.buttonText} onChange={(buttonText) => edit('colors', { buttonText })} />
      <ColorInput label="Background" value={d.colors.background} onChange={(background) => edit('colors', { background })} />
      <ColorInput label="Savings / success" value={d.colors.accent} onChange={(accent) => edit('colors', { accent })} />
      <ColorInput label="Highlight (headings, timer, gifts)" value={d.colors.highlight} onChange={(highlight) => edit('colors', { highlight })} />
      <button
        type="button"
        className="text-xs font-semibold text-brand-700 hover:underline"
        onClick={() => edit('colors', { primary: '#540812', buttonText: '#FFFFFF', background: '#FFF7ED', accent: '#16A34A', highlight: '#AC6E0D' })}
      >
        Use maroon &amp; gold
      </button>
    </section>
  );
}
