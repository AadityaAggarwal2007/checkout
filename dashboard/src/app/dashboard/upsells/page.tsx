'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';
import type { UpsellsConfig, ShopifyProduct } from '@/types';

const DEFAULTS: UpsellsConfig = {
  enabled: false,
  title: 'Recommended for You',
  mode: 'manual',
  type: 'products',
  productIds: [],
  productHandles: [],
  limit: 4,
};

export default function UpsellsPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<UpsellsConfig>(DEFAULTS);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ShopifyProduct[]>([]);
  const [selected, setSelected] = useState<ShopifyProduct[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const u = data.upsells as UpsellsConfig;
      if (u && typeof u === 'object' && 'enabled' in u) setConfig({ ...DEFAULTS, ...u });
    });
  }, [store]);

  if (!store) return null;

  async function searchProducts() {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const products = await api<ShopifyProduct[]>(
        `/api/stores/${store!.id}/products?search=${encodeURIComponent(search)}&limit=5`
      );
      setResults(products);
    } catch {}
    setSearching(false);
  }

  function addProduct(product: ShopifyProduct) {
    const handle = product.handle;
    if (config.productHandles.includes(handle)) return;
    setConfig(c => ({
      ...c,
      productIds: [...c.productIds, String(product.id)],
      productHandles: [...c.productHandles, handle],
    }));
    setSelected(s => [...s, product]);
  }

  function removeProduct(productId: string) {
    const product = selected.find(p => String(p.id) === productId);
    setConfig(c => ({
      ...c,
      productIds: c.productIds.filter(id => id !== productId),
      productHandles: c.productHandles.filter(h => h !== product?.handle),
    }));
    setSelected(s => s.filter(p => String(p.id) !== productId));
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Upsells</h2>
      <ConfigForm storeId={store.id} section="upsells" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Upsells</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Mode</label>
              <select
                value={config.mode}
                onChange={e => setConfig(c => ({ ...c, mode: e.target.value as 'manual' | 'auto' }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="manual">Manual</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Upsells</label>
              <input
                type="number"
                value={config.limit}
                onChange={e => setConfig(c => ({ ...c, limit: parseInt(e.target.value) || 4 }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                min={1}
                max={10}
              />
            </div>
          </div>

          {config.mode === 'manual' && (
            <div>
              <label className="block text-sm font-medium mb-2">Select Products</label>
              <div className="flex gap-2 mb-3">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchProducts()}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Search products..."
                />
                <button
                  onClick={searchProducts}
                  disabled={searching}
                  className="px-4 py-2 bg-gray-100 rounded-lg text-sm"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </div>

              {results.length > 0 && (
                <div className="border rounded-lg mb-3 max-h-48 overflow-y-auto">
                  {results.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 text-left text-sm"
                    >
                      {p.images[0] && (
                        <img src={p.images[0].src} alt="" className="w-10 h-10 rounded object-cover" />
                      )}
                      <div>
                        <p className="font-medium">{p.title}</p>
                        <p className="text-xs text-gray-400">₹{p.variants[0]?.price}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selected.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-medium">Selected Products:</p>
                  {selected.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                      <div className="flex items-center gap-2">
                        {p.images[0] && (
                          <img src={p.images[0].src} alt="" className="w-8 h-8 rounded object-cover" />
                        )}
                        <span className="text-sm">{p.title}</span>
                      </div>
                      <button onClick={() => removeProduct(String(p.id))} className="text-red-400 text-sm">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ConfigForm>
    </div>
  );
}
