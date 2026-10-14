'use client';
import { useEffect, useState } from 'react';

type Toast = { id: number; text: string; kind: 'ok' | 'err' };
let push: ((t: Omit<Toast, 'id'>) => void) | null = null;

/** toast('Saved') / toast('Could not save', 'err') from anywhere in the client. */
export function toast(text: string, kind: Toast['kind'] = 'ok'): void {
  push?.({ text, kind });
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
    };
    return () => {
      push = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${t.kind === 'ok' ? 'bg-ink' : 'bg-red-600'}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
