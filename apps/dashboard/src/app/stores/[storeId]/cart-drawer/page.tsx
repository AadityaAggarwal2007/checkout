'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/lib/store-context';

interface DrawerRow {
  id: string;
  name: string;
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
}

export default function Drawers() {
  const { store, role } = useStore();
  const [drawers, setDrawers] = useState<DrawerRow[] | null>(null);
  const base = `/api/stores/${store.id}/drawers`;
  const canAdmin = role === 'OWNER' || role === 'ADMIN';
  const load = useCallback(() => api<{ drawers: DrawerRow[] }>(base).then((r) => setDrawers(r.drawers)), [base]);
  useEffect(() => void load(), [load]);

  async function run(work: () => Promise<unknown>, ok: string) {
    try {
      await work();
      toast(ok);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong.', 'err');
    }
  }

  const create = () => {
    const active = drawers?.find((d) => d.isActive);
    const name = prompt('Name of the new drawer', 'Festive sale');
    if (name) void run(() => api(base, { body: { name, copyFromId: active?.id } }), 'Drawer created');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cart drawers</h1>
          <p className="text-ink-3">Keep a few designs ready (festive sale, normal days) and switch with one click.</p>
        </div>
        {canAdmin && <button className="btn-primary" onClick={create}>+ Create</button>}
      </div>
      {drawers?.map((d) => (
        <div key={d.id} className="card flex flex-wrap items-center gap-4 p-4">
          <div className="grid h-16 w-24 place-items-center rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-500 text-xl text-white">⊞</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 font-semibold">
              {d.name}
              {d.isActive && <span className="chip bg-green-100 text-green-700">Active</span>}
            </div>
            <div className="text-xs text-ink-3">Last saved {new Date(d.updatedAt).toLocaleString('en-IN')}</div>
          </div>
          {canAdmin && !d.isActive && (
            <>
              <button className="btn-secondary" onClick={() => run(() => api(`${base}/${d.id}/activate`, { body: {} }), `${d.name} is now live`)}>Make active</button>
              <button className="btn-danger" onClick={() => confirm(`Delete ${d.name}?`) && run(() => api(`${base}/${d.id}`, { method: 'DELETE' }), 'Deleted')}>Delete</button>
            </>
          )}
          <Link href={`/stores/${store.id}/cart-drawer/${d.id}`} className="btn-primary">Customize</Link>
        </div>
      ))}
    </div>
  );
}
