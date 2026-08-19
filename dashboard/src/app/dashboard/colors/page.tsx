'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { ColorsConfig } from '@/types';

const DEFAULTS: ColorsConfig = {
  primary: '#6C5CE7',
  text: '#1a1a1a',
  background: '#ffffff',
  accent: '#00b894',
};

export default function ColorsPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<ColorsConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const c = data.colors as ColorsConfig;
      if (c && typeof c === 'object' && 'primary' in c) setConfig({ ...DEFAULTS, ...c });
    });
  }, [store]);

  if (!store) return null;

  const colorFields: { key: keyof ColorsConfig; label: string }[] = [
    { key: 'primary', label: 'Primary Color' },
    { key: 'text', label: 'Text Color' },
    { key: 'background', label: 'Background Color' },
    { key: 'accent', label: 'Accent Color' },
  ];

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Color Palette</h2>
      <ConfigForm storeId={store.id} section="colors" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          {colorFields.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <input
                type="color"
                value={config[key]}
                onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                className="w-10 h-10 rounded border cursor-pointer"
              />
              <div className="flex-1">
                <label className="block text-sm font-medium">{label}</label>
                <input
                  value={config[key]}
                  onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                  className="w-32 px-2 py-1 border rounded text-sm font-mono"
                />
              </div>
            </div>
          ))}

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Preview</p>
            <div className="rounded-lg p-4" style={{ backgroundColor: config.background, color: config.text }}>
              <p className="font-medium mb-2">Sample Text</p>
              <button className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: config.primary }}>
                Checkout Button
              </button>
              <span className="ml-3 text-sm" style={{ color: config.accent }}>
                You saved ₹135!
              </span>
            </div>
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
