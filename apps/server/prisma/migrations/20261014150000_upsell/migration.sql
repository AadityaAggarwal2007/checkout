-- Upsell offers in the checkout: timer start per rule and the lines added from them.
ALTER TABLE "CheckoutSession" ADD COLUMN "upsell" JSONB;
