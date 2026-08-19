'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { DiscountsConfig } from '@/types';

const DEFAULTS: DiscountsConfig = {
  enabled: false,
  mode: 'input',
  position: 'body',
  codes: [],
  invalidMessage: 'Invalid discount code',
  appliedMessage: 'Discount applied successfully',
  confetti: { enabled: false, template: 'celebration', autoTrigger: true },
};

export default function DiscountsPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<DiscountsConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const d = data.discounts as DiscountsConfig;
      if (d && typeof d === 'object' && 'enabled' in d) setConfig({ ...DEFAULTS, ...d });
    });
  }, [store]);

  if (!store) return null;

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Discount Codes</h2>
      <ConfigForm storeId={store.id} section="discounts" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Discount Codes</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Mode</label>
              <select
                value={config.mode}
                onChange={e => setConfig(c => ({ ...c, mode: e.target.value as 'list' | 'input' }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="input">Customer Input</option>
                <option value="list">List Selection</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Position</label>
              <select
                value={config.position}
                onChange={e => setConfig(c => ({ ...c, position: e.target.value as 'body' | 'footer' }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="body">Body</option>
                <option value="footer">Footer</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Invalid Code Message</label>
            <input
              value={config.invalidMessage}
              onChange={e => setConfig(c => ({ ...c, invalidMessage: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Applied Message</label>
            <input
              value={config.appliedMessage}
              onChange={e => setConfig(c => ({ ...c, appliedMessage: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.confetti.enabled}
                onChange={e => setConfig(c => ({ ...c, confetti: { ...c.confetti, enabled: e.target.checked } }))}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm">Enable confetti</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.confetti.autoTrigger}
                onChange={e => setConfig(c => ({ ...c, confetti: { ...c.confetti, autoTrigger: e.target.checked } }))}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm">Automatic discount trigger</span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Template</label>
              <select
                value={config.confetti.template}
                onChange={e => setConfig(c => ({ ...c, confetti: { ...c.confetti, template: e.target.value } }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="celebration">Celebration</option>
                <option value="fireworks">Fireworks</option>
                <option value="stars">Stars</option>
              </select>
            </div>
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
