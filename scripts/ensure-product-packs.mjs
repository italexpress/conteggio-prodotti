import { PrismaClient } from '@prisma/client';

// Add only the new isolated table. Existing installations were provisioned
// without a complete migration baseline; never reset or push their schema.
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL mancante: deploy interrotto');
}
if (process.env.DATABASE_URL) {
  const db = new PrismaClient();
  try {
    await db.$executeRaw`CREATE TABLE IF NOT EXISTS "ProductPack" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "shop" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "composition" TEXT NOT NULL
    )`;
    await db.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "ProductPack_shop_productId_key"
      ON "ProductPack"("shop", "productId")`;
    await db.$executeRaw`ALTER TABLE "ProductPack" ADD COLUMN IF NOT EXISTS "ordered" BOOLEAN NOT NULL DEFAULT false`;
    await db.productPack.findFirst();
    console.log('ProductPack: struttura e lettura database verificate');
  } finally {
    await db.$disconnect();
  }
} else {
  console.log('Build locale senza database: provisioning rinviato alla build Vercel');
}
