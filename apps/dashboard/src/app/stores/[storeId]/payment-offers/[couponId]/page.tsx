'use client';
import { Suspense } from 'react';
import { CouponEditorPage } from '@/components/coupons/editor-page';

export default function EditOffer() {
  return (
    <Suspense>
      <CouponEditorPage offers />
    </Suspense>
  );
}
