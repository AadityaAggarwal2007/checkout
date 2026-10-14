'use client';
import type { Coupon as CoreCoupon } from '@checkout/core';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store-context';
import { CouponWizard, draftFromCoupon, newDraft, type Draft } from './wizard';

const KINDS = ['amount_off', 'buy_x_get_y', 'free_gift', 'free_shipping', 'bundle', 'purchase_driven'] as const;

/** /coupons/new?kind=…, /coupons/<id>, /payment-offers/new, /payment-offers/<id> */
export function CouponEditorPage({ offers }: { offers: boolean }) {
  const { store } = useStore();
  const { couponId } = useParams<{ couponId: string }>();
  const search = useSearchParams();
  const back = `/stores/${store.id}/${offers ? 'payment-offers' : 'coupons'}`;
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (couponId === 'new') {
      const k = search.get('kind');
      setDraft(newDraft(offers ? 'payment_offer' : ((KINDS as readonly string[]).includes(k ?? '') ? (k as CoreCoupon['kind']) : 'amount_off')));
    } else {
      api<{ coupon: unknown }>(`/api/stores/${store.id}/coupons/${couponId}`).then((r) => setDraft(draftFromCoupon(r.coupon)));
    }
  }, [couponId, search, store.id, offers]);

  if (!draft) return <p className="text-ink-3">Loading…</p>;
  return <CouponWizard storeId={store.id} initial={draft} couponId={couponId === 'new' ? undefined : couponId} backHref={back} />;
}
