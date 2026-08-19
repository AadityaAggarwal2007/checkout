'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Store } from '@/types';

interface StoreSelectorProps {
  onStoreChange: (store: Store | null) => void;
  selectedStoreId: string | null;
}

export default function StoreSelector({ onStoreChange, selectedStoreId }: StoreSelectorProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [shopifyUrl, setShopifyUrl] = useState('');
  const [adminApiToken, setAdminApiToken] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
    try {
      const data = await api<Store[]>('/api/stores');
      setStores(data);
      if (data.length > 0 && !selectedStoreId) {
        onStoreChange(data[0]);
      } else if (selectedStoreId) {
        const found = data.find(s => s.id === selectedStoreId);
        if (found) onStoreChange(found);
      }
    } catch {}
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const store = await api<Store>('/api/stores', {
        method: 'POST',
        body: JSON.stringify({ name, shopifyUrl, adminApiToken }),
      });
      setStores(prev => [...prev, store]);
      onStoreChange(store);
      setShowAdd(false);
      setName('');
      setShopifyUrl('');
      setAdminApiToken('');
    } catch {}
    setAdding(false);
  }

  return (
    <div className="flex items-center gap-3">
      <select
        value={selectedStoreId || ''}
        onChange={e => {
          const store = stores.find(s => s.id === e.target.value);
          onStoreChange(store || null);
        }}
        className="px-3 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {stores.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      <button
        onClick={() => setShowAdd(!showAdd)}
        className="text-sm text-primary hover:underline"
      >
        + Add Store
      </button>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <form onSubmit={handleAdd} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Add Shopify Store</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Store Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="My Store"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Shopify URL</label>
              <input
                value={shopifyUrl}
                onChange={e => setShopifyUrl(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="my-store.myshopify.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Admin API Access Token <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                value={adminApiToken}
                onChange={e => setAdminApiToken(e.target.value)}
                type="password"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="shpat_..."
              />
              <p className="text-xs text-gray-400 mt-1">
                Only needed for SabPaisa checkout. Settings &gt; Apps &gt; Develop apps &gt; Create custom app (scope: write_orders)
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600">
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add Store'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
