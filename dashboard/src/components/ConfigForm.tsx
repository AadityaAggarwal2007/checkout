'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import DrawerPreview from './DrawerPreview';

interface ConfigFormProps {
  storeId: string;
  section: string;
  children: React.ReactNode;
  data: unknown;
  onSaved?: () => void;
  /** Set false for sections the drawer doesn't render (e.g. store settings). */
  preview?: boolean;
}

export default function ConfigForm({
  storeId,
  section,
  children,
  data,
  onSaved,
  preview = true,
}: ConfigFormProps) {
  const [saving, setSaving] = useState(false);
  // Bumped on save so the preview re-pulls the baseline config and the panel
  // stops showing the previous save as the "saved" state.
  const [savedAt, setSavedAt] = useState(0);

  async function handleSave() {
    setSaving(true);
    try {
      await api(`/api/stores/${storeId}/config`, {
        method: 'PUT',
        body: JSON.stringify({ [section]: data }),
      });
      toast.success('Saved — preview now matches your live store');
      setSavedAt(Date.now());
      onSaved?.();
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  }

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 max-w-2xl">
        <div className="space-y-6">{children}</div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 font-medium"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {preview && (
        <div className="hidden xl:block">
          <DrawerPreview
            storeId={storeId}
            section={section}
            draft={data}
            savedAt={savedAt}
          />
        </div>
      )}
    </div>
  );
}
