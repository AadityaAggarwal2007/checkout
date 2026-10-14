'use client';
import { createContext, useContext } from 'react';

export interface StoreInfo {
  id: string;
  name: string;
  domain: string | null;
  shopDomain: string;
  status: string;
  widgetKey: string;
  shopify: { scopes: string; installedAt: string; uninstalledAt: string | null; embedSeenAt: string | null } | null;
}

export const StoreContext = createContext<{ store: StoreInfo; role: string } | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside a store page');
  return ctx;
}
