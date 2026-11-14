import assert from 'node:assert/strict';
import prisma from '../app/db.server';
import { unauthenticated } from '../app/shopify.server';
import { getAggregatedProducts } from '../app/services/orders.server';
import { getPackPlan } from '../app/services/packs.server';
import { minimumPacks } from '../app/services/packs';
import { getFulfillmentFollowup } from '../app/services/fulfillment-followup.server';
import { enrichOrderContacts } from '../app/services/order-contacts.server';
import { whatsappLink } from '../app/services/whatsapp';

try {
  const sessions = await prisma.session.findMany({ where: { isOnline: false }, select: { shop: true }, distinct: ['shop'] });
  assert(sessions.length > 0, 'Nessuna sessione Shopify disponibile per verificare il progetto');
  for (const { shop } of sessions) {
    const { admin } = await unauthenticated.admin(shop);
    const orders = await getAggregatedProducts(admin);
    const products = await getPackPlan(admin, shop, orders.products);
    const followup=await getFulfillmentFollowup(admin);
    const contacted=await enrichOrderContacts(admin,shop,followup);
    assert.equal(contacted.length,followup.length);
    for(let i=1;i<followup.length;i++) assert(followup[i-1].createdAt<=followup[i].createdAt);
    for(const row of contacted) if(row.customerPhone) assert(whatsappLink(row.customerPhone,row.name));
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
        await tx.productPack.update({where:{shop_productId:{shop,productId}},data:{ordered:true}});
        const orderedRow = await tx.productPack.findUnique({where:{shop_productId:{shop,productId}}});
        assert.equal(orderedRow?.ordered,true);
        assert.equal(orderedRow?.composition,'S/M/M/L/L/XL');
        assert.equal(await tx.productPack.count({where:{shop,productId,ordered:false}}),0);
        await tx.productPack.update({where:{shop_productId:{shop,productId}},data:{ordered:false}});
        assert.equal(await tx.productPack.count({where:{shop,productId,ordered:false}}),1);
        await tx.orderContact.create({data:{shop,orderId:productId,phone:'+393331234567'}});
        assert.equal((await tx.orderContact.findUnique({where:{shop_orderId:{shop,orderId:productId}}}))?.phone,'+393331234567');
        assert.equal(await tx.orderContact.findUnique({where:{shop_orderId:{shop:'verification-other-shop',orderId:productId}}}),null);
        assert.equal(await tx.productPack.findUnique({where:{shop_productId:{shop:'verification-other-shop',productId}}}),null);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    console.log(`Verifica reale completata: ${orders.orderCount} ordini, ${products.length} prodotti; calcolo senza giacenze e salvataggio verificati.`);
    console.log(`Ordini da evadere verificati: ${followup.length}; telefoni disponibili: ${contacted.filter(o=>o.customerPhone).length}; contatti limitati da Shopify: ${contacted.some(o=>o.contactUnavailable)}.`);
  }
} finally { await prisma.$disconnect(); }
