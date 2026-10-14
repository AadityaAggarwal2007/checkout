'use client';
import { useEffect, useState } from 'react';
import { Field, TextInput } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/lib/store-context';

interface Key {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export default function ApiKeys() {
  const { store, role } = useStore();
  const base = `/api/stores/${store.id}/api-keys`;
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    api<{ keys: Key[] }>(base).then((r) => setKeys(r.keys), () => setDenied(true));
  }, [base]);
  if (denied) return <p className="mx-auto max-w-3xl text-ink-3">Only owners and admins see API keys.</p>;
  if (!keys) return <p className="text-ink-3">Loading…</p>;
  const owner = role === 'OWNER';
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  async function call(path: string, method: string, body?: unknown) {
    try {
      const r = await api<{ keys: Key[]; key?: string }>(`${base}${path}`, { method, body });
      setKeys(r.keys);
      if (r.key) setFresh(r.key);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="text-ink-3">For your own systems (ERP, shipping tool): read your orders with a key. Keys can only read.</p>
      </div>
      {fresh && (
        <section className="card space-y-2 border-amber-300 bg-amber-50 p-5">
          <h3 className="font-semibold">Copy your key now — it is not shown again</h3>
          <div className="flex gap-2">
            <code className="block flex-1 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-green-300" data-test="new-key">{fresh}</code>
            <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(fresh).then(() => toast('Copied'))}>Copy</button>
          </div>
          <p className="text-[13px] text-ink-2">Keep it in your system's secret settings, never in chat or email.</p>
        </section>
      )}
      <section className="card divide-y divide-ink-line">
        {keys.length === 0 && <p className="p-5 text-ink-3">No keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-48 flex-1">
              <div className="font-medium">{k.name} {k.revoked && <span className="chip ml-1 bg-red-100 text-red-700">revoked</span>}</div>
              <div className="text-sm text-ink-3"><code>{k.prefix}…</code> · {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleString('en-IN')}` : 'never used'}</div>
            </div>
            {owner && !k.revoked && <button className="btn-danger" onClick={() => confirm(`Revoke "${k.name}"? Systems using it stop working.`) && void call(`/${k.id}`, 'DELETE')}>Revoke</button>}
          </div>
        ))}
      </section>
      {owner && (
        <section className="card flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-48 flex-1">
            <Field label="New key name">
              <TextInput value={name} max={60} placeholder="e.g. Shiprocket sync" onChange={setName} />
            </Field>
          </div>
          <button className="btn-primary" data-test="create-key" onClick={() => void call('', 'POST', { name }).then(() => setName(''))}>Create key</button>
        </section>
      )}
      <section className="card p-5 text-sm">
        <h3 className="mb-2 font-semibold">How to use</h3>
        <code className="block overflow-x-auto rounded-lg bg-ink p-3 text-xs text-green-300">curl -H &quot;Authorization: Bearer ck_live_…&quot; {origin}/api/v1/orders?since=2026-10-01T00:00:00Z</code>
        <p className="mt-2 text-ink-3">50 orders per page, newest first; pass <code>cursor</code> from <code>nextCursor</code> for the next page. Amounts are in paise.</p>
      </section>
    </div>
  );
}
