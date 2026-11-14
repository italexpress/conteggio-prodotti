import assert from 'node:assert/strict';
import prisma from '../app/db.server';
import { unauthenticated } from '../app/shopify.server';
import { getAggregatedProducts } from '../app/services/orders.server';
import { getPackPlan } from '../app/services/packs.server';
import { minimumPacks } from '../app/services/packs';

try {
  const sessions = await prisma.session.findMany({ where: { isOnline: false }, select: { shop: true }, distinct: ['shop'] });
  assert(sessions.length > 0, 'Nessuna sessione Shopify disponibile per verificare il progetto');
  for (const { shop } of sessions) {
    const { admin } = await unauthenticated.admin(shop);
    const orders = await getAggregatedProducts(admin);
    const products = await getPackPlan(admin, shop, orders.products);
    for (const product of products) for (const group of product.groups) {
      for (const composition of product.options) {
        const plan = minimumPacks(group.variants, composition);
        assert(plan.count === null || (Number.isInteger(plan.count) && plan.count >= 0));
      }
    }
    // Verify insert, update and tenant isolation, rolling back every test write.
    const rollback = new Error('verification-rollback');
    try {
      await prisma.$transaction(async tx => {
        const productId = `verification-${crypto.randomUUID()}`;
        await tx.productPack.create({data:{shop,productId,composition:'S/M/L/XL'}});
        await tx.productPack.update({where:{shop_productId:{shop,productId}},data:{composition:'S/M/M/L/L/XL'}});
        assert.equal((await tx.productPack.findUnique({where:{shop_productId:{shop,productId}}}))?.composition,'S/M/M/L/L/XL');
        assert.equal(await tx.productPack.findUnique({where:{shop_productId:{shop:'verification-other-shop',productId}}}),null);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    console.log(`Verifica reale completata: ${orders.orderCount} ordini, ${products.length} prodotti; calcolo senza giacenze e salvataggio verificati.`);
  }
} finally { await prisma.$disconnect(); }
