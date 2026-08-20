'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';

interface PostPurchaseConfig {
  mode: 'hosted' | 'store';
  returnUrl: string;
  title: string;
  message: string;
  failedTitle: string;
  failedMessage: string;
  showOrderSummary: boolean;
  supportEmail: string;
  supportPhone: string;
  continueUrl: string;
  continueText: string;
}

const DEFAULTS: PostPurchaseConfig = {
  mode: 'hosted',
  returnUrl: '',
  title: 'Thank you for your order!',
  message: 'We have received your order and will send updates to your phone.',
  failedTitle: 'Payment was not completed',
  failedMessage: 'No money has been taken. You can try placing the order again.',
  showOrderSummary: true,
  supportEmail: '',
  supportPhone: '',
  continueUrl: '',
  continueText: 'Continue shopping',
};

export default function PostPurchasePage() {
  const { store } = useStore();
  const [config, setConfig] = useState<PostPurchaseConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const p = data.postPurchase as PostPurchaseConfig;
      if (p && typeof p === 'object') setConfig({ ...DEFAULTS, ...p });
    });
  }, [store]);

  if (!store) return null;

  function set<K extends keyof PostPurchaseConfig>(key: K, value: PostPurchaseConfig[K]) {
    setConfig(c => ({ ...c, [key]: value }));
  }

  const field = 'w-full border rounded-lg px-3 py-2 text-sm';
  const label = 'block text-sm font-medium mb-1.5';

  return (
    <div className="max-w-[1500px]">
      <h2 className="text-2xl font-bold mb-1">After payment</h2>
      <p className="text-sm text-gray-500 mb-6">
        What the customer sees once the payment gateway sends them back.
      </p>

      {/* preview={false} — this section renders after checkout, not in the cart
          drawer, so the docked drawer preview would show nothing relevant. */}
      <ConfigForm storeId={store.id} section="postPurchase" data={config} preview={false}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold">Where they land</h3>

          <label className="flex gap-3 items-start p-3 border rounded-lg cursor-pointer">
            <input
              type="radio"
              className="mt-1"
              checked={config.mode === 'hosted'}
              onChange={() => set('mode', 'hosted')}
            />
            <span>
              <span className="font-medium text-sm">Hosted thank-you page</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                We serve a branded confirmation page with the order summary, styled
                from your drawer colors. Nothing to build on your store.
              </span>
            </span>
          </label>

          <label className="flex gap-3 items-start p-3 border rounded-lg cursor-pointer">
            <input
              type="radio"
              className="mt-1"
              checked={config.mode === 'store'}
              onChange={() => set('mode', 'store')}
            />
            <span>
              <span className="font-medium text-sm">Back to your store</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Returns to your storefront and reopens the drawer with the result
                inline. Uses the same wording you set below.
              </span>
            </span>
          </label>

          {config.mode === 'store' && (
            <div>
              <label className={label}>Return URL</label>
              <input
                className={field}
                placeholder={`https://${store.shopifyUrl}`}
                value={config.returnUrl}
                onChange={e => set('returnUrl', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                Leave blank to return to your store&apos;s home page.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold">Successful payment</h3>
          <div>
            <label className={label}>Heading</label>
            <input className={field} value={config.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label className={label}>Message</label>
            <textarea
              className={field}
              rows={2}
              value={config.message}
              onChange={e => set('message', e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.showOrderSummary}
              onChange={e => set('showOrderSummary', e.target.checked)}
            />
            Show order summary (items, discount, total)
          </label>
        </div>

        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold">Failed payment</h3>
          <div>
            <label className={label}>Heading</label>
            <input
              className={field}
              value={config.failedTitle}
              onChange={e => set('failedTitle', e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Message</label>
            <textarea
              className={field}
              rows={2}
              value={config.failedMessage}
              onChange={e => set('failedMessage', e.target.value)}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold">Continue button &amp; support</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Button text</label>
              <input
                className={field}
                value={config.continueText}
                onChange={e => set('continueText', e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Button link</label>
              <input
                className={field}
                placeholder="/collections/all"
                value={config.continueUrl}
                onChange={e => set('continueUrl', e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Support email</label>
              <input
                className={field}
                placeholder="help@yourstore.com"
                value={config.supportEmail}
                onChange={e => set('supportEmail', e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Support phone</label>
              <input
                className={field}
                placeholder="+91 98765 43210"
                value={config.supportPhone}
                onChange={e => set('supportPhone', e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Leave the button link blank to hide the button. Support details are
            hidden when empty.
          </p>
        </div>
      </ConfigForm>
    </div>
  );
}
