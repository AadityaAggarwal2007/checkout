import type { ReactNode } from 'react';
import { StoreShell } from '@/components/shell';

export default function StoreLayout({ children, params }: { children: ReactNode; params: { storeId: string } }) {
  return <StoreShell storeId={params.storeId}>{children}</StoreShell>;
}
