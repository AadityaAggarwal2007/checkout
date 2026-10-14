'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { inr } from '@/lib/money';

export interface PickedProduct {
  productId: string;
  title: string;
  image?: string;
  variants: Array<{ variantId: string; title: string; price: number; available: boolean }>;
}

/** Search the store's products and pick some (by product id). Shows the picked ones with remove buttons. */
export function ProductPicker({ storeId, value, onChange, max = 30 }: { storeId: string; value: string[]; onChange: (ids: string[]) => void; max?: number }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [picked, setPicked] = useState<PickedProduct[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value.length === 0) return setPicked([]);
    api<{ products: PickedProduct[] }>(`/api/stores/${storeId}/products?ids=${value.join(',')}`).then((r) =>
      setPicked(value.map((id) => r.products.find((p) => p.productId === id)).filter((p): p is PickedProduct => !!p)),
    );
  }, [storeId, value]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<{ products: PickedProduct[] }>(`/api/stores/${storeId}/products?q=${encodeURIComponent(query)}`).then((r) => setResults(r.products), () => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [storeId, query, open]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input className="input" placeholder="Search products" value={query} onFocus={() => setOpen(true)} onChange={(e) => setQuery(e.target.value)} />
        {open && (
          <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-ink-line bg-white p-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
            {results.length === 0 && <div className="px-3 py-2 text-ink-3">No products found.</div>}
            {results.map((p) => {
              const on = value.includes(p.productId);
              return (
                <button
                  key={p.productId}
                  type="button"
                  disabled={!on && value.length >= max}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ink-soft disabled:opacity-40"
                  onClick={() => onChange(on ? value.filter((x) => x !== p.productId) : [...value, p.productId])}
                >
                  <Thumb src={p.image} />
                  <span className="flex-1">{p.title}</span>
                  <span className={`chip ${on ? 'bg-brand-50 text-brand-700' : 'text-ink-3'}`}>{on ? 'Added' : 'Add'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {picked.map((p) => (
        <div key={p.productId} className="flex items-center gap-3 rounded-lg border border-ink-line px-3 py-2">
          <Thumb src={p.image} />
          <span className="flex-1">
            <span className="block font-medium">{p.title}</span>
            <span className="text-xs text-ink-3">{p.variants[0] ? inr(p.variants[0].price) : ''}</span>
          </span>
          <button type="button" className="text-ink-3 hover:text-red-600" aria-label={`Remove ${p.title}`} onClick={() => onChange(value.filter((x) => x !== p.productId))}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function Thumb({ src }: { src?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="h-9 w-9 rounded-md border border-ink-line object-cover" /> : <span className="h-9 w-9 rounded-md bg-ink-soft" />;
}
