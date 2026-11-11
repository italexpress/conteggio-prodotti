CREATE TABLE IF NOT EXISTS "SupplierProduct" (
  "id" TEXT PRIMARY KEY, "shop" TEXT NOT NULL, "groupKey" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "colorKey" TEXT NOT NULL,
  "supplier" TEXT NOT NULL DEFAULT '', "supplierCode" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '', "packType" TEXT NOT NULL DEFAULT 'assorted',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("shop", "groupKey")
);
CREATE TABLE IF NOT EXISTS "ManualProductStock" (
  "id" TEXT PRIMARY KEY, "shop" TEXT NOT NULL, "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" >= 0),
  "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE ("shop", "variantId")
);
CREATE TABLE IF NOT EXISTS "SupplierPurchase" (
  "id" TEXT PRIMARY KEY, "shop" TEXT NOT NULL, "groupKey" TEXT NOT NULL,
  "productTitle" TEXT NOT NULL, "supplier" TEXT NOT NULL, "supplierCode" TEXT NOT NULL,
  "notes" TEXT NOT NULL, "packType" TEXT NOT NULL, "packs" INTEGER NOT NULL CHECK ("packs" > 0),
  "items" JSONB NOT NULL, "expectedArrivalDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ordered', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SupplierPurchase_shop_createdAt_idx" ON "SupplierPurchase"("shop", "createdAt");
ALTER TABLE "SupplierProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManualProductStock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierPurchase" ENABLE ROW LEVEL SECURITY;
