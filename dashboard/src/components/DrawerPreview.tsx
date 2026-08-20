'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';

interface DrawerPreviewProps {
  storeId: string;
  /** Config key this page edits, e.g. "announcements". */
  section: string;
  /** Draft value for that section — unsaved edits included. */
  draft: unknown;
  /** Bumped by ConfigForm after a successful save to re-pull the baseline. */
  savedAt?: number;
}

/**
 * Live drawer preview.
 *
 * Renders /preview.html from the widget server in an iframe and pushes the
 * draft config in over postMessage. The iframe runs the real widget bundle, so
 * what shows here is what a storefront renders — only the Shopify cart is faked.
 *
 * The page being edited owns one section, so the saved config is fetched as a
 * baseline and the draft is layered on top; otherwise switching to Announcements
 * would preview a drawer with no products, colors or reward bar.
 */
export default function DrawerPreview({ storeId, section, draft, savedAt }: DrawerPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Record<string, unknown>>(`/api/stores/${storeId}/config`)
      .then(data => { if (!cancelled) setSaved(data || {}); })
      .catch(() => { if (!cancelled) setSaved({}); });
    return () => { cancelled = true; };
  }, [storeId, savedAt]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'shopdrawer:preview-ready') setReady(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const post = useCallback(() => {
    if (!ready || !saved) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'shopdrawer:config', config: { ...saved, [section]: draft } },
      '*'
    );
  }, [ready, saved, section, draft]);

  useEffect(() => { post(); }, [post]);

  return (
    <div className="w-[400px] shrink-0">
      <div className="sticky top-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Live preview
          </span>
          <span className="text-xs text-gray-400">Unsaved edits included</span>
        </div>

        <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
          <iframe
            ref={iframeRef}
            src={`${API_URL}/api/preview/preview.html`}
            title="Drawer preview"
            className="block w-full h-[680px] border-0"
          />
        </div>

        <p className="mt-2 text-xs text-gray-400 leading-relaxed">
          Sample cart shown. Products, prices and totals come from placeholder
          items so the layout can be judged without touching your live store.
        </p>
      </div>
    </div>
  );
}
