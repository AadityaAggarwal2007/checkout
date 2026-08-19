'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { AddonRule } from '@/types';

interface AddonsConfig {
  enabled: boolean;
  rules: AddonRule[];
}

const DEFAULTS: AddonsConfig = { enabled: false, rules: [] };

export default function AddonsPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<AddonsConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const a = data.addons;
      if (a && typeof a === 'object' && 'enabled' in (a as object)) {
        setConfig({ ...DEFAULTS, ...(a as AddonsConfig) });
      }
    });
  }, [store]);

  if (!store) return null;

  function addRule() {
    setConfig(c => ({
      ...c,
      rules: [...c.rules, { id: Date.now().toString(), triggerProductId: '', addonProductId: '', price: null }],
    }));
  }

  function updateRule(idx: number, updates: Partial<AddonRule>) {
    setConfig(c => ({
      ...c,
      rules: c.rules.map((r, i) => i === idx ? { ...r, ...updates } : r),
    }));
  }

  function removeRule(idx: number) {
    setConfig(c => ({ ...c, rules: c.rules.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Add-ons</h2>
      <ConfigForm storeId={store.id} section="addons" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Add-ons</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Add-on Rules</label>
              <button onClick={addRule} className="text-sm text-primary hover:underline">+ Add Rule</button>
            </div>

            {config.rules.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p>No add-on rules configured</p>
                <p className="text-sm">Add rules to offer product add-ons to your customers</p>
              </div>
            )}

            {config.rules.map((rule, i) => (
              <div key={rule.id} className="border rounded-lg p-3 mb-2 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Rule {i + 1}</span>
                  <button onClick={() => removeRule(i)} className="text-red-400 hover:text-red-600">🗑</button>
                </div>
                <input
                  value={rule.triggerProductId}
                  onChange={e => updateRule(i, { triggerProductId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Trigger Product ID"
                />
                <input
                  value={rule.addonProductId}
                  onChange={e => updateRule(i, { addonProductId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Add-on Product ID"
                />
                <input
                  type="number"
                  value={rule.price ?? ''}
                  onChange={e => updateRule(i, { price: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Custom price (leave empty for original)"
                />
              </div>
            ))}
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
