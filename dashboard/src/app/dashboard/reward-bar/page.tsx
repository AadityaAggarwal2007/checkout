'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { RewardBarConfig, RewardTier } from '@/types';

const DEFAULTS: RewardBarConfig = {
  enabled: false,
  tiers: [],
  template: 'with_icon',
  countingMethod: 'total_value',
  confetti: { enabled: false, template: 'fireworks', trigger: 'each_tier' },
};

export default function RewardBarPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<RewardBarConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const r = data.rewardBar as RewardBarConfig;
      if (r && typeof r === 'object' && 'enabled' in r) setConfig({ ...DEFAULTS, ...r });
    });
  }, [store]);

  if (!store) return null;

  function addTier() {
    setConfig(c => ({
      ...c,
      tiers: [...c.tiers, { label: '', threshold: 0, type: 'shipping' as const }],
    }));
  }

  function updateTier(idx: number, updates: Partial<RewardTier>) {
    setConfig(c => ({
      ...c,
      tiers: c.tiers.map((t, i) => i === idx ? { ...t, ...updates } : t),
    }));
  }

  function removeTier(idx: number) {
    setConfig(c => ({ ...c, tiers: c.tiers.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Reward Bar</h2>
      <ConfigForm storeId={store.id} section="rewardBar" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Reward Bar</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Template</label>
              <select
                value={config.template}
                onChange={e => setConfig(c => ({ ...c, template: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="with_icon">With Icon</option>
                <option value="minimal">Minimal</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Counting Method</label>
              <select
                value={config.countingMethod}
                onChange={e => setConfig(c => ({ ...c, countingMethod: e.target.value as 'total_value' | 'quantity' }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="total_value">Total Value</option>
                <option value="quantity">Quantity</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Reward Tiers</label>
              <button onClick={addTier} className="text-sm text-primary hover:underline">+ Add Tier</button>
            </div>
            {config.tiers.map((tier, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input
                  value={tier.label}
                  onChange={e => updateTier(i, { label: e.target.value })}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Label (e.g. Free Shipping)"
                />
                <select
                  value={tier.type}
                  onChange={e => updateTier(i, { type: e.target.value as RewardTier['type'] })}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="shipping">Shipping</option>
                  <option value="product">Product</option>
                  <option value="gift">Gift</option>
                </select>
                <input
                  type="number"
                  value={tier.threshold}
                  onChange={e => updateTier(i, { threshold: parseInt(e.target.value) || 0 })}
                  className="w-24 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Threshold"
                />
                <button onClick={() => removeTier(i)} className="text-red-400 hover:text-red-600">🗑</button>
              </div>
            ))}
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
            {config.confetti.enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Confetti Template</label>
                  <select
                    value={config.confetti.template}
                    onChange={e => setConfig(c => ({ ...c, confetti: { ...c.confetti, template: e.target.value } }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="fireworks">Fireworks</option>
                    <option value="stars">Stars</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Confetti Trigger</label>
                  <select
                    value={config.confetti.trigger}
                    onChange={e => setConfig(c => ({ ...c, confetti: { ...c.confetti, trigger: e.target.value } }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="each_tier">After Each Tier</option>
                    <option value="final_tier">Final Tier Only</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
