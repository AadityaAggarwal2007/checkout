'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { FreeGift } from '@/types';

interface FreeGiftsData {
  enabled: boolean;
  gifts: FreeGift[];
}

const DEFAULTS: FreeGiftsData = { enabled: false, gifts: [] };

export default function FreeGiftsPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<FreeGiftsData>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const fg = data.freeGifts;
      if (Array.isArray(fg)) {
        setConfig({ enabled: fg.length > 0, gifts: fg as FreeGift[] });
      } else if (fg && typeof fg === 'object' && 'enabled' in (fg as object)) {
        setConfig({ ...DEFAULTS, ...(fg as FreeGiftsData) });
      }
    });
  }, [store]);

  if (!store) return null;

  function addGift() {
    setConfig(c => ({
      ...c,
      gifts: [...c.gifts, { id: Date.now().toString(), productId: '', threshold: 0, triggerType: 'value' as const, label: '' }],
    }));
  }

  function updateGift(idx: number, updates: Partial<FreeGift>) {
    setConfig(c => ({
      ...c,
      gifts: c.gifts.map((g, i) => i === idx ? { ...g, ...updates } : g),
    }));
  }

  function removeGift(idx: number) {
    setConfig(c => ({ ...c, gifts: c.gifts.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Free Gifts</h2>
      <ConfigForm storeId={store.id} section="freeGifts" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Free Gifts</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Gift Tiers</label>
              <button onClick={addGift} className="text-sm text-primary hover:underline">+ Add Gift Tier</button>
            </div>

            {config.gifts.map((gift, i) => (
              <div key={gift.id} className="border rounded-lg p-3 mb-2 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Tier {i + 1}</span>
                  <button onClick={() => removeGift(i)} className="text-red-400 hover:text-red-600">🗑</button>
                </div>
                <input
                  value={gift.label}
                  onChange={e => updateGift(i, { label: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Label (e.g. Free Gift ₹299)"
                />
                <input
                  value={gift.productId}
                  onChange={e => updateGift(i, { productId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Gift Product ID"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={gift.triggerType}
                    onChange={e => updateGift(i, { triggerType: e.target.value as 'value' | 'quantity' })}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="value">Cart Value</option>
                    <option value="quantity">Cart Quantity</option>
                  </select>
                  <input
                    type="number"
                    value={gift.threshold}
                    onChange={e => updateGift(i, { threshold: parseInt(e.target.value) || 0 })}
                    className="px-3 py-2 border rounded-lg text-sm"
                    placeholder="Threshold"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
