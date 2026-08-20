'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store-context';
import ConfigForm from '@/components/ConfigForm';
import { api } from '@/lib/api';

const ALL_BADGES = [
  { id: 'razorpay', label: 'Razorpay' },
  { id: 'payu', label: 'PayU' },
  { id: 'phonepe', label: 'PhonePe' },
  { id: 'paytm', label: 'Paytm' },
  { id: 'google_pay', label: 'Google Pay' },
  { id: 'upi', label: 'UPI' },
  { id: 'visa', label: 'Visa' },
  { id: 'mastercard', label: 'Mastercard' },
  { id: 'amex', label: 'American Express' },
  { id: 'rupay', label: 'RuPay' },
  { id: 'netbanking', label: 'NetBanking' },
  { id: 'cod', label: 'Cash on Delivery' },
  { id: 'sabpaisa', label: 'SabPaisa' },
  { id: 'ccavenue', label: 'CCAvenue' },
  { id: 'cashfree', label: 'Cashfree' },
  { id: 'easebuzz', label: 'Easebuzz' },
  { id: 'instamojo', label: 'Instamojo' },
  { id: 'apple_pay', label: 'Apple Pay' },
  { id: 'amazon_pay', label: 'Amazon Pay' },
];

interface TrustBadgesData {
  enabled: boolean;
  badges: string[];
}

const DEFAULTS: TrustBadgesData = { enabled: false, badges: [] };

export default function TrustBadgesPage() {
  const { store } = useStore();
  const [config, setConfig] = useState<TrustBadgesData>(DEFAULTS);

  useEffect(() => {
    if (!store) return;
    api<Record<string, unknown>>(`/api/stores/${store.id}/config`).then(data => {
      const tb = data.trustBadges;
      if (Array.isArray(tb)) {
        setConfig({ enabled: tb.length > 0, badges: tb as string[] });
      } else if (tb && typeof tb === 'object' && 'enabled' in (tb as object)) {
        setConfig({ ...DEFAULTS, ...(tb as TrustBadgesData) });
      }
    });
  }, [store]);

  if (!store) return null;

  function toggleBadge(id: string) {
    setConfig(c => ({
      ...c,
      badges: c.badges.includes(id)
        ? c.badges.filter(b => b !== id)
        : [...c.badges, id],
    }));
  }

  return (
    <div className="max-w-[1500px]">
      <h2 className="text-2xl font-bold mb-6">Trust Badges</h2>
      <ConfigForm storeId={store.id} section="trustBadges" data={config}>
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-medium">Enable Trust Badges</label>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
              className="w-5 h-5 accent-primary"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            {ALL_BADGES.map(badge => (
              <button
                key={badge.id}
                onClick={() => toggleBadge(badge.id)}
                className={`p-3 border rounded-lg text-center text-sm transition-colors ${
                  config.badges.includes(badge.id)
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {badge.label}
              </button>
            ))}
          </div>
        </div>
      </ConfigForm>
    </div>
  );
}
