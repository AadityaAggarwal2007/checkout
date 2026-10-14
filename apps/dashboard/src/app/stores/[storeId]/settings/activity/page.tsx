'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store-context';

interface Item {
  id: string;
  at: string;
  action: string;
  summary: string;
  by: string;
}

export default function Activity() {
  const { store } = useStore();
  const [items, setItems] = useState<Item[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const load = useCallback(
    (cursor?: string) =>
      api<{ items: Item[]; nextCursor: string | null }>(`/api/stores/${store.id}/activity${cursor ? `?cursor=${cursor}` : ''}`).then(
        (r) => {
          setItems((old) => (cursor ? [...(old ?? []), ...r.items] : r.items));
          setNext(r.nextCursor);
        },
        () => setDenied(true),
      ),
    [store.id],
  );
  useEffect(() => void load(), [load]);
  if (denied) return <p className="mx-auto max-w-3xl text-ink-3">Only owners and admins see the activity log.</p>;
  if (!items) return <p className="text-ink-3">Loading…</p>;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Activity log</h1>
        <p className="text-ink-3">Every change made in this dashboard: who, what, when.</p>
      </div>
      <section className="card divide-y divide-ink-line">
        {items.length === 0 && <p className="p-5 text-ink-3">Nothing yet.</p>}
        {items.map((i) => (
          <div key={i.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3 text-sm" data-test="activity-row">
            <span className="w-40 shrink-0 text-ink-3">{new Date(i.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="flex-1">{i.summary}</span>
            <span className="text-ink-3">{i.by}</span>
          </div>
        ))}
      </section>
      {next && <button className="btn-secondary" onClick={() => void load(next)}>Load more</button>}
    </div>
  );
}
