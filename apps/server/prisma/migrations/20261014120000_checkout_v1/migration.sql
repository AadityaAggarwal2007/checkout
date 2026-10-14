-- AlterEnum
ALTER TYPE "GatewayProvider" ADD VALUE 'DEV';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "number" TEXT NOT NULL,
ADD COLUMN     "shopifyError" TEXT;

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "draft" JSONB;

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "checkoutEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextOrderNumber" INTEGER NOT NULL DEFAULT 1001,
ADD COLUMN     "orderPrefix" TEXT NOT NULL DEFAULT 'CK';

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_number_key" ON "Order"("storeId", "number");

