'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store-context';
import { useEffect, useState } from 'react';
import { AnalyticsPanel } from '@/components/analytics';
import { GoLive } from '@/components/go-live';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api';

export default function Overview() {
  const { store } = useStore();
  const seen = store.shopify?.embedSeenAt ? new Date(store.shopify.embedSeenAt) : null;
  const live = seen && Date.now() - seen.getTime() < 24 * 3600 * 1000;
  const snippet = `<script src="${typeof window === 'undefined' ? '' : window.location.origin}/storefront/loader.js" data-key="${store.widgetKey}" defer></script>`;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {store.name}</h1>
        <p className="text-ink-3">Your cart drawer and checkout, in one place.</p>
      </div>
      <GoLive storeId={store.id} />
      <AnalyticsPanel storeId={store.id} />
      <h2 className="pt-2 text-lg font-semibold">Setup</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Cart drawer" value={live ? 'Live on your store' : 'Not seen yet'} tone={live ? 'ok' : 'warn'} />
        <Stat label="Shopify" value={store.shopify && !store.shopify.uninstalledAt ? 'Connected' : 'Not connected'} tone={store.shopify && !store.shopify.uninstalledAt ? 'ok' : 'warn'} />
        <CheckoutStat storeId={store.id} />
      </div>
      <section className="card p-5">
        <h2 className="font-semibold">Turn the drawer on</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-ink-2">
          <li>In Shopify admin open <b>Online Store → Themes → Customize → App embeds</b>.</li>
          <li>Switch on <b>Cart drawer</b> and click <b>Save</b>.</li>
          <li>Open your store and add a product to the cart: our drawer opens.</li>
        </ol>
        <details className="mt-4 text-[13px] text-ink-3">
          <summary className="cursor-pointer font-medium text-ink-2">Theme without app embeds? Paste this before &lt;/body&gt;</summary>
          <div className="mt-2 flex items-start gap-2">
            <code className="block flex-1 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-green-300">{snippet}</code>
            <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(snippet).then(() => toast('Copied'))}>Copy</button>
          </div>
        </details>
      </section>
      <Link href={`/stores/${store.id}/cart-drawer`} className="card flex items-center justify-between p-5 hover:border-brand-500">
        <span>
          <span className="block font-semibold">Design your cart drawer</span>
          <span className="text-ink-3">Announcements, reward bar, upsells, coupons, trust badges…</span>
        </span>
        <span className="text-xl">→</span>
      </Link>
    </div>
  );
}

function CheckoutStat({ storeId }: { storeId: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ settings: { checkoutEnabled: boolean } }>(`/api/stores/${storeId}/payments`).then((r) => setOn(r.settings.checkoutEnabled), () => setOn(null));
  }, [storeId]);
  return (
    <Link href={`/stores/${storeId}/settings/payments`}>
      <Stat label="Checkout" value={on === null ? 'Settings → Payments' : on ? 'On for shoppers' : 'Off (Shopify checkout)'} tone={on ? 'ok' : 'muted'} />
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'muted' }) {
  const dot = tone === 'ok' ? 'bg-green-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-zinc-300';
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-1.5 flex items-center gap-2 font-semibold">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {value}
      </div>
    </div>
  );
}
