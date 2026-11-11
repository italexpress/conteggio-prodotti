import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAggregatedProducts } from './orders.server.ts';

const line = (title, quantity = 1) => ({ node: {
  title, currentQuantity: quantity, unfulfilledQuantity: quantity, requiresShipping: true, variantTitle: 'Nero / S',
  product: { id: title }, variant: { id: title },
} });
const order = (id, lines, cod = false, accepted = false) => ({ node: {
  id, name: id, createdAt: '2026-11-10T10:00:00Z',
  displayFinancialStatus: cod ? 'PENDING' : 'PAID',
  paymentGatewayNames: cod ? ['contrassegno'] : [],
  tags: accepted ? ['ACCETTATO'] : [], lineItems: { edges: lines },
} });
const admin = (pages) => ({ graphql: async () => ({ json: async () => {
  const edges = pages.shift();
  return { data: { orders: { edges, pageInfo: {
    hasNextPage: pages.length > 0, endCursor: pages.length ? 'next' : null,
  } } } };
} }) });

test('exchange-only orders do not contribute to orders, COD or products', async () => {
  const result = await getAggregatedProducts(admin([[
    order('paid', [line('SPEDIZIONE EXCHANGE')]),
    order('accepted', [line(' spedizione  exchange ')], true, true),
    order('unconfirmed', [line('Spedizione Exchange')], true),
  ]]));
  assert.equal(result.orderCount, 0);
  assert.equal(result.codAcceptedCount, 0);
  assert.deepEqual(result.products, []);
  assert.deepEqual(result.unconfirmedCodOrders, []);
  assert.deepEqual(result.affectedOrdersMap, {});
});

test('mixed orders retain products and quantities across pages', async () => {
  const result = await getAggregatedProducts(admin([
    [order('mixed', [line('SPEDIZIONE EXCHANGE'), line('PANTALONE WB', 2)], true)],
    [order('normal', [line('PANTALONE WB', 1)], true, true)],
  ]));
  assert.equal(result.orderCount, 2);
  assert.equal(result.codAcceptedCount, 1);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].totalQuantity, 3);
  assert.equal(result.products[0].codAcceptedQuantity, 1);
  assert.equal(result.unconfirmedCodOrders[0].itemCount, 2);
  assert.equal(result.unconfirmedCodOrders[0].items.length, 1);
  assert.equal(result.affectedOrdersMap['PANTALONE WB'].length, 2);
});

test('an exchange service plus removed products is excluded', async () => {
  const result = await getAggregatedProducts(admin([[
    order('removed', [line('SPEDIZIONE EXCHANGE'), line('PANTALONE WB', 0)]),
  ]]));
  assert.equal(result.orderCount, 0);
});

test('purchasing excludes pending, attention, held and partially refunded demand', async () => {
  const paid=order('paid',[line('PANTALONE WB',3)]);
  paid.node.lineItems.edges[0].node.unfulfilledQuantity=1;
  const accepted=order('accepted',[line('PANTALONE WB',2)],true,true);
  const waiting=order('waiting',[line('PANTALONE WB',5)],true);
  const attention=order('attention',[line('PANTALONE WB',7)],true,true);
  attention.node.tags.push('RICHIEDE ATTENZIONE');
  const held=order('held',[line('PANTALONE WB',9)]);held.node.displayFulfillmentStatus='ON_HOLD';
  const refunded=order('refunded',[line('PANTALONE WB',4)]);refunded.node.displayFinancialStatus='PARTIALLY_REFUNDED';
  const result=await getAggregatedProducts(admin([[paid,accepted,waiting,attention,held,refunded]]));
  assert.equal(result.products[0].purchaseQuantity,3);
  assert.equal(result.products[0].totalQuantity,28);
});

test('cancelled and test orders and COD fees do not create purchasing demand',async()=>{
  const cancelled=order('cancelled',[line('PANTALONE WB')]);cancelled.node.cancelledAt='2026-11-10';
  const fake=order('test',[line('PANTALONE WB')]);fake.node.test=true;
  const fees=order('fees',[line('Pagamento alla Consegna'),line('Commissione pagamento alla consegna')]);
  const result=await getAggregatedProducts(admin([[cancelled,fake,fees]]));
  assert.equal(result.orderCount,0);
});
