import type { Coupon as CoreCoupon, CouponKind } from '@checkout/core';
import type { Coupon as CouponRow, CouponKind as DbKind, Prisma } from '@prisma/client';

const KIND: Record<DbKind, CouponKind> = {
  AMOUNT_OFF: 'amount_off',
  BUY_X_GET_Y: 'buy_x_get_y',
  FREE_GIFT: 'free_gift',
  FREE_SHIPPING: 'free_shipping',
  BUNDLE: 'bundle',
  PURCHASE_DRIVEN: 'purchase_driven',
  PAYMENT_OFFER: 'payment_offer',
};
const DB_KIND = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k])) as Record<CouponKind, DbKind>;

/** DB row -> engine coupon. The columns win over the JSON for the fields that have columns. */
export function toCoreCoupon(row: CouponRow): CoreCoupon {
  const rule = (row.rule ?? {}) as Record<string, unknown>;
  const limits = { combinable: true, ...((rule.limits as object) ?? {}) } as CoreCoupon['limits'];
  if (row.startsAt) limits.startsAt = row.startsAt.toISOString();
  if (row.endsAt) limits.endsAt = row.endsAt.toISOString();
  return {
    condition: {},
    eligibility: {},
    ...rule,
    limits,
    id: row.id,
    kind: KIND[row.kind],
    code: row.code ?? undefined,
    automatic: row.automatic,
    active: row.active && !row.deletedAt,
    title: row.title ?? undefined,
    priority: row.priority,
  } as CoreCoupon;
}

/** Engine coupon -> DB row data (for the seed now, the coupon editor in Phase 3). */
export function toCouponRow(storeId: string, c: CoreCoupon, visible = true): Prisma.CouponUncheckedCreateInput {
  const { id: _id, kind, code, automatic, active, title, priority, ...rule } = c;
  return {
    storeId,
    kind: DB_KIND[kind],
    code: code ? code.trim().toUpperCase() : null,
    automatic,
    active,
    visible,
    title: title ?? null,
    priority: priority ?? 0,
    rule: rule as unknown as Prisma.InputJsonValue,
    startsAt: c.limits.startsAt ? new Date(c.limits.startsAt) : null,
    endsAt: c.limits.endsAt ? new Date(c.limits.endsAt) : null,
  };
}
