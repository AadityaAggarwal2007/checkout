'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { ConfirmationConfig } from '@/types';

const DEFAULTS: ConfirmationConfig = {
  enabled: false,
  text: 'I accept the terms and conditions',
  checkboxEnabled: true,
  required: false,
};

export default function ConfirmationPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<ConfirmationConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const c = data.confirmation as ConfirmationConfig;
      if (c && typeof c === 'object' && 'enabled' in c) setConfig({ ...DEFAULTS, ...c });
    });
  }, [store]);

  if (!store) return null;

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Confirmation Text</h2>
      <ConfigForm storeId={store.id} section="confirmation" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Confirmation Text</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Content</label>
            <textarea
              value={config.text}
              onChange={e => setConfig(c => ({ ...c, text: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              rows={3}
              maxLength={100}
            />
            <p className="text-xs text-gray-400 text-right">{config.text.length}/100</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.checkboxEnabled}
              onChange={e => setConfig(c => ({ ...c, checkboxEnabled: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">Enable checkbox</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.required}
              onChange={e => setConfig(c => ({ ...c, required: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">Required checkbox</span>
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
