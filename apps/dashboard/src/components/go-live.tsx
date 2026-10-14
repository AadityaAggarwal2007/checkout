'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Item {
  key: string;
  ok: boolean;
  title: string;
  todo: string;
  href?: string;
  server?: boolean;
}

/** Home: what is left before real shoppers use the checkout. Hidden once everything is done. */
export function GoLive({ storeId }: { storeId: string }) {
  const [data, setData] = useState<{ items: Item[]; ready: boolean } | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    api<{ items: Item[]; ready: boolean }>(`/api/stores/${storeId}/go-live`).then(setData, () => undefined);
  }, [storeId]);
  if (!data || data.ready) return null;
  const done = data.items.filter((i) => i.ok).length;
  return (
    <section className="card p-5" data-test="go-live">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span>
          <span className="block font-semibold">Go-live checklist</span>
          <span className="text-sm text-ink-3">{done} of {data.items.length} done before real shoppers use the checkout</span>
        </span>
        <span className="text-ink-3">{open ? '▲' : '▼'}</span>
      </button>
      <div className="mt-3 h-2 rounded-full bg-ink-soft">
        <div className="h-2 rounded-full bg-green-500" style={{ width: `${(done / data.items.length) * 100}%` }} />
      </div>
      {open && (
        <ul className="mt-4 space-y-2">
          {data.items.map((i) => (
            <li key={i.key} className="flex items-start gap-3 text-sm">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${i.ok ? 'bg-green-500' : 'bg-zinc-300'}`}>{i.ok ? '✓' : ''}</span>
              <span className="flex-1">
                <span className={`block font-medium ${i.ok ? 'text-ink-3' : ''}`}>{i.title}</span>
                {!i.ok && (
                  <span className="text-ink-3">
                    {i.todo} {i.server && <span className="chip ml-1 bg-amber-100 text-amber-700">server setting — Claude does it with your keys</span>}
                  </span>
                )}
              </span>
              {!i.ok && i.href && (
                <Link href={`/stores/${storeId}${i.href}`} className="text-sm font-semibold text-brand-700">Open →</Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
