'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { SettingsConfig } from '@/types';

const DEFAULTS: SettingsConfig = {
  showComparePrice: true,
  showSavings: true,
  showVariantSelector: true,
  showProperties: true,
  openDrawerOnAdd: true,
  emptyCart: {
    title: 'Your cart is empty',
    description: "Looks like you haven't added anything to your cart yet",
    buttonText: 'Continue Shopping',
    buttonUrl: '/collections/all',
  },
};

export default function SettingsPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<SettingsConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const s = data.settings as SettingsConfig;
      if (s && typeof s === 'object' && 'showComparePrice' in s) {
        setConfig({ ...DEFAULTS, ...s, emptyCart: { ...DEFAULTS.emptyCart, ...(s.emptyCart || {}) } });
      }
    });
  }, [store]);

  if (!store) return null;

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <ConfigForm storeId={store.id} section="settings" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold">Display Settings</h3>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-500">Pricing</p>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={config.showComparePrice} onChange={e => setConfig(c => ({ ...c, showComparePrice: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <span className="text-sm">Show compare at price</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={config.showSavings} onChange={e => setConfig(c => ({ ...c, showSavings: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <span className="text-sm">Show savings</span>
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-500">Products</p>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={config.showVariantSelector} onChange={e => setConfig(c => ({ ...c, showVariantSelector: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <span className="text-sm">Show variant selector</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={config.showProperties} onChange={e => setConfig(c => ({ ...c, showProperties: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <span className="text-sm">Show properties</span>
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-500">Cart</p>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={config.openDrawerOnAdd} onChange={e => setConfig(c => ({ ...c, openDrawerOnAdd: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <span className="text-sm">Open drawer on add to cart</span>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold">Empty Cart State</h3>

          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              value={config.emptyCart.title}
              onChange={e => setConfig(c => ({ ...c, emptyCart: { ...c.emptyCart, title: e.target.value } }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              maxLength={30}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              value={config.emptyCart.description}
              onChange={e => setConfig(c => ({ ...c, emptyCart: { ...c.emptyCart, description: e.target.value } }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              maxLength={60}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Button Text</label>
              <input
                value={config.emptyCart.buttonText}
                onChange={e => setConfig(c => ({ ...c, emptyCart: { ...c.emptyCart, buttonText: e.target.value } }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                maxLength={25}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Button URL</label>
              <input
                value={config.emptyCart.buttonUrl}
                onChange={e => setConfig(c => ({ ...c, emptyCart: { ...c.emptyCart, buttonUrl: e.target.value } }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
