'use client';
import { Suspense } from 'react';
import { CouponEditorPage } from '@/components/coupons/editor-page';

export default function EditCoupon() {
  return (
    <Suspense>
      <CouponEditorPage offers={false} />
    </Suspense>
  );
}
