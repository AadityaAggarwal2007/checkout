'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useStore } from '@/lib/store-context';

/** Settings opens on Payments (the other settings pages arrive in later phases). */
export default function Settings() {
  const { store } = useStore();
  const router = useRouter();
  useEffect(() => router.replace(`/stores/${store.id}/settings/payments`), [router, store.id]);
  return null;
}
