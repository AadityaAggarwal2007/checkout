'use client';

import { createContext, useContext } from 'react';
import type { Store } from '@/types';

interface StoreContextValue {
  store: Store | null;
  setStore: (s: Store | null) => void;
}

export const StoreContext = createContext<StoreContextValue>({ store: null, setStore: () => {} });

export function useStore() {
  return useContext(StoreContext);
}
