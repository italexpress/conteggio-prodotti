CREATE TABLE IF NOT EXISTS "ProductPack" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "composition" TEXT NOT NULL,
  CONSTRAINT "ProductPack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPack_shop_productId_key" ON "ProductPack"("shop", "productId");
