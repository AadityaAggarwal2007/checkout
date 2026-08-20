'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { NotesConfig } from '@/types';

const DEFAULTS: NotesConfig = {
  enabled: false,
  position: 'body',
  title: 'Any eligible discounts will be',
  placeholder: 'Add note here...',
  charLimit: 300,
};

export default function NotesPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<NotesConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const n = data.notes as NotesConfig;
      if (n && typeof n === 'object' && 'enabled' in n) setConfig({ ...DEFAULTS, ...n });
    });
  }, [store]);

  if (!store) return null;

  return (
    <div className="max-w-[1500px]">
      <h2 className="text-2xl font-bold mb-6">Additional Notes</h2>
      <ConfigForm storeId={store.id} section="notes" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Additional Notes</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
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

          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              value={config.title}
              onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              maxLength={30}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Placeholder</label>
            <input
              value={config.placeholder}
              onChange={e => setConfig(c => ({ ...c, placeholder: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              maxLength={30}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <input type="checkbox" checked={config.charLimit > 0} onChange={e => setConfig(c => ({ ...c, charLimit: e.target.checked ? 300 : 0 }))} className="w-4 h-4 accent-primary" />
              <label className="text-sm font-medium">Limit character count</label>
            </div>
            {config.charLimit > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={config.charLimit}
                  onChange={e => setConfig(c => ({ ...c, charLimit: parseInt(e.target.value) || 300 }))}
                  className="w-24 px-3 py-2 border rounded-lg text-sm"
                />
                <span className="text-sm text-gray-500">characters</span>
              </div>
            )}
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
