'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

interface ConfigFormProps {
  storeId: string;
  section: string;
  children: React.ReactNode;
  data: unknown;
  onSaved?: () => void;
}

export default function ConfigForm({ storeId, section, children, data, onSaved }: ConfigFormProps) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api(`/api/stores/${storeId}/config`, {
        method: 'PUT',
        body: JSON.stringify({ [section]: data }),
      });
      toast.success('Saved successfully');
      onSaved?.();
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  }

  return (
    <div>
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
  );
}
