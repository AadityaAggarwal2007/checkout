'use client';
import { useEffect, useState } from 'react';
import { Field, Section, TextInput, Toggle } from '@/components/ui/fields';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useStore } from '@/lib/store-context';

interface Pixel {
  enabled: boolean;
  pixelId: string;
}

export default function Integrations() {
  const { store, role } = useStore();
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const base = `/api/stores/${store.id}/integrations`;
  const [p, setP] = useState<Pixel | null>(null);
  useEffect(() => {
    api<{ metaPixel: Pixel }>(base).then((r) => setP(r.metaPixel));
  }, [base]);
  if (!p) return <p className="text-ink-3">Loading…</p>;

  async function save(next: Pixel) {
    try {
      const r = await api<{ metaPixel: Pixel }>(`${base}/meta-pixel`, { method: 'PUT', body: next });
      setP(r.metaPixel);
      toast(next.enabled ? 'Meta Pixel on' : 'Saved');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'err');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-ink-3">Send your checkout's events to your ad accounts.</p>
      </div>
      <Section
        title="Meta Pixel"
        description="AddToCart, InitiateCheckout and Purchase (with the order value) go to your pixel from your store page. No phone numbers or addresses are sent."
        right={<Toggle checked={p.enabled} disabled={!canEdit} label="Meta Pixel on" onChange={(enabled) => void save({ ...p, enabled })} />}
      >
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Pixel id" hint="Meta Events Manager → Data sources → your pixel → the number under its name.">
              <TextInput value={p.pixelId} max={20} placeholder="123456789012345" onChange={(pixelId) => setP({ ...p, pixelId: pixelId.replace(/\D/g, '') })} />
            </Field>
          </div>
          {canEdit && <button className="btn-secondary mb-[22px]" data-test="save-pixel" onClick={() => void save(p)}>Save</button>}
        </div>
        <p className="mt-2 text-[13px] text-ink-3">If Shopify's own Facebook channel also sends Purchase for you, keep only one of them on, or purchases count twice.</p>
      </Section>
    </div>
  );
}
