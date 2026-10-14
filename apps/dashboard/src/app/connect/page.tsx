'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

/** Landing after a Shopify install for a merchant who was not logged in: link the store to the account. */
function Connect() {
  const router = useRouter();
  const token = useSearchParams().get('claim') ?? '';
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token) return setError('This link is incomplete. Open the app from your Shopify admin again.');
    api<{ storeId: string }>('/api/stores/claim', { body: { token } })
      .then(({ storeId }) => router.replace(`/stores/${storeId}`))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not connect the store.'));
  }, [token, router]);
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card max-w-sm p-7 text-center">
        <h1 className="text-lg font-semibold">{error ? 'Could not connect' : 'Connecting your store…'}</h1>
        {error && <p className="mt-2 text-sm text-ink-3">{error}</p>}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Connect />
    </Suspense>
  );
}
