'use client';
import { useEffect, useState } from 'react';
import { ProductPicker, type PickedProduct } from '@/components/product-picker';
import { Radio } from '@/components/ui/fields';
import { api } from '@/lib/api';
import { inr } from '@/lib/money';

interface Collection {
  collectionId: string;
  title: string;
  image?: string;
}

/** Search the store's collections and pick some (by id). */
export function CollectionPicker({ storeId, value, onChange }: { storeId: string; value: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Collection[]>([]);
  const [picked, setPicked] = useState<Collection[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value.length === 0) return setPicked([]);
    api<{ collections: Collection[] }>(`/api/stores/${storeId}/collections?ids=${value.join(',')}`).then((r) => setPicked(r.collections), () => undefined);
  }, [storeId, value]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<{ collections: Collection[] }>(`/api/stores/${storeId}/collections?q=${encodeURIComponent(query)}`).then((r) => setResults(r.collections), () => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [storeId, query, open]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input className="input" placeholder="Search collections" value={query} onFocus={() => setOpen(true)} onChange={(e) => setQuery(e.target.value)} />
        {open && (
          <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-ink-line bg-white p-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
            {results.length === 0 && <div className="px-3 py-2 text-ink-3">No collections found.</div>}
            {results.map((c) => {
              const on = value.includes(c.collectionId);
              return (
                <button key={c.collectionId} type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-ink-soft" onClick={() => onChange(on ? value.filter((x) => x !== c.collectionId) : [...value, c.collectionId])}>
                  {c.title}
                  <span className={`chip ${on ? 'bg-brand-50 text-brand-700' : 'text-ink-3'}`}>{on ? 'Added' : 'Add'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {picked.map((c) => (
        <div key={c.collectionId} className="flex items-center justify-between rounded-lg border border-ink-line px-3 py-2">
          <span className="font-medium">{c.title}</span>
          <button type="button" className="text-ink-3 hover:text-red-600" aria-label={`Remove ${c.title}`} onClick={() => onChange(value.filter((x) => x !== c.collectionId))}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export interface Scope {
  productIds?: string[];
  collectionIds?: string[];
  excludeVariantIds?: string[];
}

/** "Any items" / specific products / specific collections. */
export function ScopePicker({ storeId, value, onChange, allowAny = true }: { storeId: string; value: Scope | undefined; onChange: (s: Scope) => void; allowAny?: boolean }) {
  const mode: 'any' | 'products' | 'collections' = value?.productIds?.length ? 'products' : value?.collectionIds?.length ? 'collections' : value && (value as { _mode?: string })._mode ? ((value as { _mode: 'products' | 'collections' })._mode) : allowAny ? 'any' : 'collections';
  const set = (m: string) => onChange(m === 'any' ? {} : ({ _mode: m } as Scope));
  return (
    <div className="space-y-3">
      <Radio
        value={mode}
        onChange={set}
        options={[...(allowAny ? ([['any', 'Any items']] as Array<['any', string]>) : []), ['products', 'Specific products'], ['collections', 'Specific collections']]}
      />
      {mode === 'products' && <ProductPicker storeId={storeId} value={value?.productIds ?? []} onChange={(ids) => onChange({ productIds: ids, ...(ids.length ? {} : { _mode: 'products' }) } as Scope)} />}
      {mode === 'collections' && <CollectionPicker storeId={storeId} value={value?.collectionIds ?? []} onChange={(ids) => onChange({ collectionIds: ids, ...(ids.length ? {} : { _mode: 'collections' }) } as Scope)} />}
    </div>
  );
}

/** Strip the picker's own marker before sending. */
export const cleanScope = (s: Scope | undefined): Scope => ({ productIds: s?.productIds ?? [], collectionIds: s?.collectionIds ?? [], excludeVariantIds: s?.excludeVariantIds ?? [] });

export interface GiftChoice {
  productId: string;
  variantId: string;
  quantity: number;
}

/** Free products: pick products, then the variant and free quantity of each. */
export function GiftPicker({ storeId, value, onChange }: { storeId: string; value: GiftChoice[]; onChange: (v: GiftChoice[]) => void }) {
  const [products, setProducts] = useState<PickedProduct[]>([]);
  const productIds = value.map((g) => g.productId).filter(Boolean);
  const key = productIds.join(',');

  useEffect(() => {
    if (!key) return setProducts([]);
    api<{ products: PickedProduct[] }>(`/api/stores/${storeId}/products?ids=${key}`).then((r) => setProducts(r.products), () => undefined);
  }, [storeId, key]);

  async function pick(ids: string[]) {
    const r = ids.length ? await api<{ products: PickedProduct[] }>(`/api/stores/${storeId}/products?ids=${ids.join(',')}`) : { products: [] };
    onChange(
      ids
        .map((id) => value.find((g) => g.productId === id) ?? { productId: id, variantId: r.products.find((p) => p.productId === id)?.variants[0]?.variantId ?? '', quantity: 1 })
        .filter((g) => g.variantId),
    );
  }

  return (
    <div className="space-y-3">
      <ProductPicker storeId={storeId} value={productIds} max={5} onChange={(ids) => void pick(ids)} />
      {value.map((g, i) => {
        const p = products.find((x) => x.productId === g.productId);
        return (
          <div key={g.productId} className="flex flex-wrap items-center gap-3 rounded-lg bg-ink-soft px-3 py-2 text-sm">
            <span className="flex-1 font-medium">{p?.title ?? 'Free product'}</span>
            {p && p.variants.length > 1 && (
              <select className="input w-56 py-1" aria-label="Variant" value={g.variantId} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, variantId: e.target.value } : x)))}>
                {p.variants.map((v) => (
                  <option key={v.variantId} value={v.variantId}>
                    {v.title} · {inr(v.price)}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2">
              Free qty
              <input className="input w-16 py-1" type="number" min={1} max={10} value={g.quantity} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} />
            </label>
          </div>
        );
      })}
    </div>
  );
}
