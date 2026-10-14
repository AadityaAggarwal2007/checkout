/** Order list types and labels shared by the Orders pages. */
export interface OrderRow {
  id: string;
  number: string;
  shopifyName: string | null;
  shopifyError: string | null;
  createdAt: string;
  contactName: string | null;
  contactPhone: string;
  paymentMode: 'PREPAID' | 'COD' | 'PARTIAL_COD';
  paymentStatus: string;
  paymentMethod: string | null;
  total: number;
  paidAmount: number;
  dueOnDelivery: number;
  _count: { lines: number };
}

export const MODE: Record<OrderRow['paymentMode'], [string, string]> = {
  PREPAID: ['Prepaid', 'bg-green-100 text-green-700'],
  COD: ['COD', 'bg-amber-100 text-amber-700'],
  PARTIAL_COD: ['Partial COD', 'bg-sky-100 text-sky-700'],
};
