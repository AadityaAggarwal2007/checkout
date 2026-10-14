'use client';
import { useEffect, useState } from 'react';
import { Field, Select, TextInput } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/lib/store-context';

type Role = 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER';
interface Member {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  lastLoginAt: string | null;
}
const ROLE_TEXT: Record<Role, string> = { OWNER: 'Owner', ADMIN: 'Admin — everything but billing and API keys', STAFF: 'Staff — orders and day-to-day', VIEWER: 'Viewer — can only look' };

export default function Team() {
  const { store, role } = useStore();
  const base = `/api/stores/${store.id}/team`;
  const [data, setData] = useState<{ members: Member[]; me: string } | null>(null);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN' | 'STAFF' | 'VIEWER'>('STAFF');
  useEffect(() => {
    api<{ members: Member[]; me: string }>(base).then(setData, () => setDenied(true));
  }, [base]);
  if (denied) return <p className="mx-auto max-w-3xl text-ink-3">Only owners and admins see the team.</p>;
  if (!data) return <p className="text-ink-3">Loading…</p>;
  const owner = role === 'OWNER';
  const roles: Array<['ADMIN' | 'STAFF' | 'VIEWER', string]> = [...(owner ? [['ADMIN', 'Admin'] as ['ADMIN', string]] : []), ['STAFF', 'Staff'], ['VIEWER', 'Viewer']];

  async function call(path: string, method: string, body?: unknown, ok?: string) {
    try {
      const r = await api<{ members: Member[] }>(`${base}${path}`, { method, body });
      setData((d) => (d ? { ...d, members: r.members } : d));
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
      return false;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-ink-3">People who can open this dashboard. They sign up with their own email first, then you add them here.</p>
      </div>
      <section className="card divide-y divide-ink-line">
        {data.members.map((m) => {
          const canTouch = m.userId !== data.me && m.role !== 'OWNER' && (owner || m.role !== 'ADMIN');
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 p-4" data-test="member-row">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{m.name ?? m.email} {m.userId === data.me && <span className="text-ink-3">(you)</span>}</div>
                <div className="text-sm text-ink-3">{m.email} · {m.lastLoginAt ? `last login ${new Date(m.lastLoginAt).toLocaleDateString('en-IN')}` : 'never logged in'}</div>
              </div>
              {canTouch ? (
                <>
                  <select className="input w-32" value={m.role} onChange={(e) => void call(`/${m.id}`, 'PATCH', { role: e.target.value }, 'Role changed')}>
                    {roles.map(([r, l]) => (
                      <option key={r} value={r}>{l}</option>
                    ))}
                  </select>
                  <button className="btn-danger" onClick={() => confirm(`Remove ${m.email}?`) && void call(`/${m.id}`, 'DELETE', undefined, 'Removed')}>Remove</button>
                </>
              ) : (
                <span className="chip bg-ink-soft text-ink-2">{m.role.toLowerCase()}</span>
              )}
            </div>
          );
        })}
      </section>
      <section className="card space-y-3 p-5">
        <h3 className="font-semibold">Add a person</h3>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="Their email (they must have signed up)">
            <TextInput value={email} max={200} placeholder="name@company.com" onChange={setEmail} />
          </Field>
          <Field label="Role">
            <Select value={newRole} onChange={setNewRole} options={roles} />
          </Field>
        </div>
        <p className="text-sm text-ink-3">{ROLE_TEXT[newRole]}</p>
        <button className="btn-primary" data-test="add-member" onClick={async () => (await call('', 'POST', { email, role: newRole }, 'Added')) && setEmail('')}>Add to team</button>
      </section>
    </div>
  );
}
