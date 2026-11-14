CREATE TABLE IF NOT EXISTS "OrderContact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "phone" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderContact_shop_orderId_key" ON "OrderContact"("shop", "orderId");
