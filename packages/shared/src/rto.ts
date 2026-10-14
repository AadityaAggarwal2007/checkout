import { formatINR } from '@checkout/core';
import { z } from 'zod';
import { INDIAN_STATES, normalizeIndianMobile } from './india.js';

/**
 * RTO suite (Settings of the dashboard): rules that switch Cash on delivery off for risky orders.
 * The engine is packages/core cod.ts; this is the dashboard / API shape.
 */
const paise = z.number().int().min(0).max(100_000_000);
const range = <T extends z.ZodTypeAny>(t: T) => ({ min: t.optional(), max: t.optional() });
const ids = z.array(z.string().regex(/^\d{1,20}$/)).min(1, 'Choose at least one').max(200);

export const rtoConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cart_amount'), ...range(paise) }),
  z.object({ kind: z.literal('item_count'), ...range(z.number().int().min(0).max(999)) }),
  z.object({ kind: z.literal('cod_orders'), ...range(z.number().int().min(0).max(9999)) }),
  z.object({ kind: z.literal('customer_type'), type: z.enum(['new', 'repeat']) }),
  z.object({ kind: z.literal('returns'), max: z.number().int().min(0).max(999) }),
  z.object({
    kind: z.literal('user'),
    phones: z
      .array(z.string())
      .min(1, 'Add at least one number')
      .max(20_000)
      .transform((list, ctx) => {
        const out = list.map((p) => normalizeIndianMobile(p));
        const bad = list.find((_, i) => !out[i]);
        if (bad !== undefined) {
          ctx.addIssue({ code: 'custom', message: `"${bad}" is not a valid mobile number` });
          return z.NEVER;
        }
        return [...new Set(out as string[])];
      }),
  }),
  z.object({ kind: z.literal('pincode'), mode: z.enum(['list', 'allow_list']), pincodes: z.array(z.string().regex(/^[1-9]\d{5}$/, 'Pincodes have 6 digits')).min(1, 'Add at least one pincode').max(30_000) }),
  z.object({ kind: z.literal('state'), mode: z.enum(['list', 'allow_list']), states: z.array(z.enum(INDIAN_STATES)).min(1, 'Choose at least one state') }),
  z.object({ kind: z.literal('product'), productIds: ids }),
  z.object({ kind: z.literal('collection'), collectionIds: ids }),
]).superRefine((c, ctx) => {
  if (c.kind !== 'cart_amount' && c.kind !== 'item_count' && c.kind !== 'cod_orders') return;
  if (c.min === undefined && c.max === undefined) ctx.addIssue({ code: 'custom', message: 'Set a minimum or a maximum' });
  if (c.min !== undefined && c.max !== undefined && c.max < c.min) ctx.addIssue({ code: 'custom', message: 'The maximum must be above the minimum' });
});
export type RtoConditionInput = z.output<typeof rtoConditionSchema>;

export const rtoRuleInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the rule').max(60),
    active: z.boolean().default(true),
    priority: z.number().int().min(0).max(1000).default(0),
    condition: rtoConditionSchema,
    blockCod: z.boolean().default(true),
    blockPartialCod: z.boolean().default(false),
  })
  .refine((r) => r.blockCod || r.blockPartialCod, 'Choose what the rule switches off');
export type RtoRuleInput = z.output<typeof rtoRuleInputSchema>;

export interface RtoRuleView extends RtoRuleInput {
  id: string;
}

export const RTO_KINDS: Array<{ kind: RtoConditionInput['kind']; title: string; text: string }> = [
  { kind: 'cart_amount', title: 'Cart amount', text: 'COD only for orders between two amounts.' },
  { kind: 'item_count', title: 'Number of items', text: 'COD only for carts with this many items.' },
  { kind: 'cod_orders', title: 'Past COD orders', text: 'Limit COD for customers who already ordered COD many times.' },
  { kind: 'customer_type', title: 'New or repeat customer', text: 'e.g. no COD on the first order.' },
  { kind: 'returns', title: 'Returned orders', text: 'No COD for customers with many returns.' },
  { kind: 'user', title: 'Specific customers', text: 'Block COD for these mobile numbers.' },
  { kind: 'pincode', title: 'Pincodes', text: 'Block COD for some pincodes, or allow it only for some.' },
  { kind: 'state', title: 'States', text: 'Block COD for some states, or allow it only for some.' },
  { kind: 'product', title: 'Products', text: 'No COD when the cart has these products.' },
  { kind: 'collection', title: 'Collections', text: 'No COD when the cart has items of these collections.' },
];

const between = (min: string | undefined, max: string | undefined, what: string) =>
  min && max ? `${what} is not between ${min} and ${max}` : min ? `${what} is below ${min}` : `${what} is above ${max}`;

/** "When the cart amount is below ₹299" — the WHEN part of a rule, in words. */
export function describeRto(c: RtoConditionInput): string {
  switch (c.kind) {
    case 'cart_amount':
      return `When ${between(c.min !== undefined ? formatINR(c.min) : undefined, c.max !== undefined ? formatINR(c.max) : undefined, 'the cart amount')}`;
    case 'item_count':
      return `When ${between(c.min?.toString(), c.max?.toString(), 'the number of items')}`;
    case 'cod_orders':
      return `When ${between(c.min?.toString(), c.max?.toString(), 'the customer’s past COD orders')}`;
    case 'customer_type':
      return c.type === 'new' ? 'When it is a new customer (first order)' : 'When it is a repeat customer';
    case 'returns':
      return `When the customer returned more than ${c.max} order${c.max === 1 ? '' : 's'}`;
    case 'user':
      return `When the customer is one of ${c.phones.length} number${c.phones.length === 1 ? '' : 's'}`;
    case 'pincode':
      return c.mode === 'list' ? `When the pincode is one of ${c.pincodes.length} listed` : `When the pincode is NOT one of ${c.pincodes.length} allowed`;
    case 'state':
      return c.mode === 'list' ? `When the state is ${c.states.slice(0, 3).join(', ')}${c.states.length > 3 ? ` +${c.states.length - 3}` : ''}` : `When the state is not ${c.states.slice(0, 3).join(', ')}${c.states.length > 3 ? ` +${c.states.length - 3}` : ''}`;
    case 'product':
      return `When the cart has one of ${c.productIds.length} product${c.productIds.length === 1 ? '' : 's'}`;
    case 'collection':
      return `When the cart has items of ${c.collectionIds.length} collection${c.collectionIds.length === 1 ? '' : 's'}`;
  }
}
