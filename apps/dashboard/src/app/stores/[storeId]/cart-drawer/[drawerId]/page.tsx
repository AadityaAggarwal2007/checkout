'use client';
import type { DrawerSettings } from '@checkout/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Colors, isOn, SectionEditor, SECTIONS, type SectionKey } from '@/components/drawer/sections';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/lib/store-context';

interface Drawer {
  id: string;
  name: string;
  isActive: boolean;
  config: DrawerSettings;
}

export default function DrawerEditor({ params }: { params: { drawerId: string } }) {
  const { store, role } = useStore();
  const [saved, setSaved] = useState<Drawer | null>(null);
  const [draft, setDraft] = useState<DrawerSettings | null>(null);
  const [section, setSection] = useState<SectionKey>('announcements');
  const [saving, setSaving] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const url = `/api/stores/${store.id}/drawers/${params.drawerId}`;
  const readOnly = role === 'VIEWER';

  useEffect(() => {
    api<{ drawer: Drawer }>(url).then(({ drawer }) => {
      setSaved(drawer);
      setDraft(drawer.config);
    });
  }, [url]);

  const sendPreview = useCallback(() => {
    if (draft) frame.current?.contentWindow?.postMessage({ type: 'ck:preview', drawer: draft, storeName: store.name }, window.location.origin);
  }, [draft, store.name]);
  useEffect(sendPreview, [sendPreview]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => e.origin === window.location.origin && e.data?.type === 'ck:preview-ready' && sendPreview();
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [sendPreview]);

  const dirty = !!saved && !!draft && JSON.stringify(saved.config) !== JSON.stringify(draft);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => dirty && e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = <K extends keyof DrawerSettings>(key: K, patch: Partial<DrawerSettings[K]>) =>
    setDraft((d) => (d ? { ...d, [key]: { ...d[key], ...patch } } : d));

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const { drawer } = await api<{ drawer: Drawer }>(url, { method: 'PUT', body: { config: draft } });
      setSaved(drawer);
      setDraft(drawer.config);
      toast(saved?.isActive ? 'Saved — live on your store' : 'Saved');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
    } finally {
      setSaving(false);
    }
  }

  if (!saved || !draft) return <div className="text-ink-3">Loading…</div>;
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href={`/stores/${store.id}/cart-drawer`} className="btn-secondary px-3" aria-label="Back">←</Link>
        <h1 className="flex-1 text-xl font-semibold">
          {saved.name} {saved.isActive && <span className="chip ml-1 bg-green-100 align-middle text-green-700">Active</span>}
        </h1>
        {dirty && <span className="text-sm text-amber-600">Unsaved changes</span>}
        <button className="btn-secondary" disabled={!dirty || saving} onClick={() => setDraft(saved.config)}>Discard</button>
        <button className="btn-primary" disabled={!dirty || saving || readOnly} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <nav className="card divide-y divide-ink-line overflow-hidden">
            {SECTIONS.map((s) => {
              const on = isOn(draft, s.key);
              return (
                <button key={s.key} onClick={() => setSection(s.key)} className={`flex w-full items-center gap-2.5 px-4 py-3 text-left ${section === s.key ? 'bg-ink-soft font-semibold' : 'hover:bg-ink-soft'}`}>
                  <span className="w-5 text-center">{s.icon}</span>
                  <span className="flex-1">{s.label}</span>
                  {on && <span className="chip bg-green-100 text-green-700">Active</span>}
                </button>
              );
            })}
          </nav>
          <Colors d={draft} edit={edit} storeId={store.id} />
        </div>
        <fieldset disabled={readOnly} className="min-w-0 space-y-4">
          <SectionEditor k={section} d={draft} edit={edit} storeId={store.id} />
        </fieldset>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Live preview</div>
          <iframe ref={frame} title="Drawer preview" src="/storefront/preview" className="h-[720px] w-full rounded-2xl border border-ink-line bg-white shadow-card" />
        </div>
      </div>
    </div>
  );
}
