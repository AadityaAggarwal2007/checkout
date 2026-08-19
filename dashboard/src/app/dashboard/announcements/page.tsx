'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { AnnouncementsConfig } from '@/types';

const DEFAULTS: AnnouncementsConfig = {
  enabled: false,
  messages: [],
  duration: 5,
};

export default function AnnouncementsPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<AnnouncementsConfig>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const a = data.announcements as AnnouncementsConfig;
      if (a && typeof a === 'object' && 'enabled' in a) setConfig({ ...DEFAULTS, ...a });
    });
  }, [store]);

  if (!store) return null;

  function addMessage() {
    setConfig(c => ({ ...c, messages: [...c.messages, { text: '' }] }));
  }

  function updateMessage(idx: number, text: string) {
    setConfig(c => ({
      ...c,
      messages: c.messages.map((m, i) => i === idx ? { text } : m),
    }));
  }

  function removeMessage(idx: number) {
    setConfig(c => ({ ...c, messages: c.messages.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Announcements</h2>
      <ConfigForm storeId={store.id} section="announcements" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Announcements</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Messages</label>
            {config.messages.map((msg, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={msg.text}
                  onChange={e => updateMessage(i, e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  placeholder={`Message ${i + 1}`}
                  maxLength={50}
                />
                <span className="text-xs text-gray-400 self-center">{msg.text.length}/50</span>
                <button onClick={() => removeMessage(i)} className="text-red-400 hover:text-red-600 text-lg">
                  🗑
                </button>
              </div>
            ))}
            <button onClick={addMessage} className="text-sm text-primary hover:underline">
              + Add Message
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Display Duration</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={config.duration}
                onChange={e => setConfig(c => ({ ...c, duration: parseInt(e.target.value) || 5 }))}
                className="w-20 px-3 py-2 border rounded-lg text-sm"
                min={1}
                max={30}
              />
              <span className="text-sm text-gray-500">seconds</span>
            </div>
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
