import type { Coupon as CoreCoupon } from '@checkout/core';
import { couponDataToCore, couponHeadline, couponInputSchema, type CouponData, type CouponListRow } from '@checkout/shared';
import { Prisma, type Coupon as CouponRow } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../lib/activity.js';
import { HttpError, badRequest, notFound } from '../lib/errors.js';
import { requireStore } from '../plugins/auth.js';
import { toCoreCoupon, toCouponRow } from '../rules/coupons.js';

const P = '/api/stores/:storeId/coupons';
type Params = { storeId: string; couponId: string };

const patchBody = z.object({ active: z.boolean().optional(), visible: z.boolean().optional() });
const bulkBody = z.object({ ids: z.array(z.string()).min(1).max(200), action: z.enum(['activate', 'deactivate', 'delete']) });

const label = (row: { code: string | null; title: string | null }) => row.code ?? row.title ?? 'automatic offer';

/**
 * Coupons and payment offers (one engine, packages/core). Payment offers are coupons of kind
 * PAYMENT_OFFER and live on their own dashboard page (?kind=payment_offer).
 */
export function couponRoutes(app: FastifyInstance): void {
  const { prisma, catalog } = app.deps;

  /** Wizard data -> engine coupon, with free-gift titles and prices read from the catalog (never trusted from the browser). */
  async function toEngine(storeId: string, data: CouponData): Promise<CoreCoupon> {
    if (data.kind !== 'free_gift') return couponDataToCore(data);
    const variants = await catalog.variants(storeId, data.gifts.map((g) => g.variantId), true);
    const info: Record<string, { productId: string; title: string; image?: string; unitPrice: number }> = {};
    for (const g of data.gifts) {
      const v = variants.get(g.variantId);
      if (!v) throw badRequest('One of the free products is not in your store any more.', 'unknown_gift');
      info[g.variantId] = { productId: v.productId, title: v.title && v.title !== 'Default Title' ? `${v.productTitle} (${v.title})` : v.productTitle, image: v.image, unitPrice: v.price };
    }
    return couponDataToCore(data, '', info);
  }

  function parse(body: unknown): CouponData {
    const parsed = couponInputSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw badRequest(issue?.message ?? 'Check the coupon.', 'invalid_coupon');
    }
    return parsed.data;
  }

  const codeTaken = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

  async function load(storeId: string, couponId: string): Promise<CouponRow> {
    const row = await prisma.coupon.findFirst({ where: { id: couponId, storeId, deletedAt: null } });
    if (!row) throw notFound('Coupon not found.');
    return row;
  }

  /** The editor's data: the engine coupon plus the display fields. */
  const view = (row: CouponRow) => ({ ...toCoreCoupon(row), visible: row.visible, details: row.details, createdAt: row.createdAt, updatedAt: row.updatedAt });

  app.get(P, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId } = req.params as Params;
    const q = req.query as { kind?: string; q?: string };
    const offers = q.kind === 'payment_offer';
    const text = q.q?.trim().slice(0, 40);
    const rows = await prisma.coupon.findMany({
      where: {
        storeId,
        deletedAt: null,
        kind: offers ? 'PAYMENT_OFFER' : { not: 'PAYMENT_OFFER' },
        ...(text ? { OR: [{ code: { contains: text.toUpperCase() } }, { title: { contains: text, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
    const stats = rows.length
      ? await prisma.$queryRaw<Array<{ couponId: string; orders: number; gross: number; discount: number; net: number }>>`
          SELECT r."couponId", count(DISTINCT r."orderId")::int AS orders, coalesce(sum(o."subtotal"), 0)::int AS gross,
                 coalesce(sum(r."amount"), 0)::int AS discount, coalesce(sum(o."total"), 0)::int AS net
          FROM "CouponRedemption" r JOIN "Order" o ON o."id" = r."orderId"
          WHERE r."storeId" = ${storeId} AND o."cancelledAt" IS NULL
          GROUP BY r."couponId"`
      : [];
    const coupons: CouponListRow[] = rows.map((row) => {
      const core = toCoreCoupon(row);
      const s = stats.find((x) => x.couponId === row.id);
      return {
        id: row.id,
        kind: core.kind,
        code: row.code,
        title: row.title,
        headline: couponHeadline(core),
        automatic: row.automatic,
        active: row.active,
        visible: row.visible,
        combinable: core.limits.combinable,
        createdAt: row.createdAt.toISOString(),
        stats: { orders: s?.orders ?? 0, gross: s?.gross ?? 0, discount: s?.discount ?? 0, net: s?.net ?? 0 },
      };
    });
    return { coupons };
  });

  app.get(`${P}/:couponId`, { preHandler: requireStore('VIEWER') }, async (req) => {
    const { storeId, couponId } = req.params as Params;
    return { coupon: view(await load(storeId, couponId)) };
  });

  app.post(P, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const data = parse(req.body);
    const core = await toEngine(storeId, data);
    try {
      const row = await prisma.coupon.create({ data: { ...toCouponRow(storeId, core, data.visible), details: data.details } });
      await logActivity(app, storeId, req.user!.id, 'coupon.create', `Created ${row.kind === 'PAYMENT_OFFER' ? 'payment offer' : 'coupon'} - ${label(row)}`, row.id);
      return { coupon: view(row) };
    } catch (err) {
      if (codeTaken(err)) throw new HttpError(409, 'code_taken', `The code ${data.code} is already used by another coupon.`);
      throw err;
    }
  });

  app.put(`${P}/:couponId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, couponId } = req.params as Params;
    const before = await load(storeId, couponId);
    const data = parse(req.body);
    const core = await toEngine(storeId, data);
    const row = toCouponRow(storeId, core, data.visible);
    if (row.kind !== before.kind) throw badRequest('The type of a coupon cannot change. Create a new one.');
    try {
      const saved = await prisma.coupon.update({ where: { id: before.id }, data: { ...row, storeId: undefined, details: data.details } });
      await logActivity(app, storeId, req.user!.id, 'coupon.update', `Updated ${saved.kind === 'PAYMENT_OFFER' ? 'payment offer' : 'coupon'} - ${label(saved)}`, saved.id);
      return { coupon: view(saved) };
    } catch (err) {
      if (codeTaken(err)) throw new HttpError(409, 'code_taken', `The code ${data.code} is already used by another coupon.`);
      throw err;
    }
  });

  app.patch(`${P}/:couponId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, couponId } = req.params as Params;
    const before = await load(storeId, couponId);
    const body = patchBody.safeParse(req.body);
    if (!body.success) throw badRequest('Nothing to change.');
    const saved = await prisma.coupon.update({ where: { id: before.id }, data: body.data });
    const what = body.data.active !== undefined ? (body.data.active ? 'Activated' : 'Deactivated') : body.data.visible ? 'Showed' : 'Hid';
    await logActivity(app, storeId, req.user!.id, 'coupon.update', `${what} coupon - ${label(saved)}`, saved.id);
    return { coupon: view(saved) };
  });

  app.post(`${P}/bulk`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId } = req.params as Params;
    const body = bulkBody.safeParse(req.body);
    if (!body.success) throw badRequest('Choose coupons first.');
    const where = { storeId, id: { in: body.data.ids }, deletedAt: null };
    const rows = await prisma.coupon.findMany({ where, select: { id: true, code: true, title: true } });
    if (body.data.action === 'delete') await softDelete(rows);
    else await prisma.coupon.updateMany({ where, data: { active: body.data.action === 'activate' } });
    await logActivity(app, storeId, req.user!.id, 'coupon.bulk', `Bulk ${body.data.action}d coupons - ${rows.map(label).join(', ').slice(0, 300)}`);
    return { count: rows.length };
  });

  app.delete(`${P}/:couponId`, { preHandler: requireStore('ADMIN') }, async (req) => {
    const { storeId, couponId } = req.params as Params;
    const row = await load(storeId, couponId);
    await softDelete([row]);
    await logActivity(app, storeId, req.user!.id, 'coupon.delete', `Deleted coupon - ${label(row)}`, row.id);
    return { ok: true };
  });

  /** Kept for order history (redemptions point at it); the code is freed for a new coupon. */
  async function softDelete(rows: Array<{ id: string; code: string | null; title: string | null }>) {
    await prisma.$transaction(
      rows.map((r) => prisma.coupon.update({ where: { id: r.id }, data: { deletedAt: new Date(), active: false, visible: false, code: null, title: r.title ?? r.code } })),
    );
  }
}
