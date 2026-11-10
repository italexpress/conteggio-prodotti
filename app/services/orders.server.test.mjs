import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAggregatedProducts } from './orders.server.ts';

const line = (title, quantity = 1) => ({ node: {
  title, currentQuantity: quantity, variantTitle: 'Nero / S',
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

