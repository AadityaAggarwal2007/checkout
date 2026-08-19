'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import StoreSelector from '@/components/StoreSelector';
import { clearToken } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { StoreContext } from '@/lib/store-context';
import type { Store } from '@/types';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <StoreContext.Provider value={{ store, setStore }}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b bg-white flex items-center justify-between px-6">
            <StoreSelector
              selectedStoreId={store?.id || null}
              onStoreChange={setStore}
            />
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
            </div>
          </header>
          <main className="flex-1 p-6">
            {store ? children : (
              <div className="text-center text-gray-400 mt-20">
                <p className="text-lg">Select or add a store to get started</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </StoreContext.Provider>
  );
}
