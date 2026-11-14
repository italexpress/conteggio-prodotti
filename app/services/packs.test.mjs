import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compatibleCompositions, minimumPacks, normalizeSize, inventoryAccessDenied } from './packs.ts';
const variant = (size, demand, stock) => ({ id: size, size, demand, stock, group: '', sku: size });

test('only real Shopify sizes enable a composition, XXL is conditional', () => {
  assert.deepEqual(compatibleCompositions(['S','M','L','XL']), ['S/M/L/XL','S/M/M/L/L/XL']);
  assert.equal(compatibleCompositions(['S','M','L','XL','XXL']).length, 4);
  assert.deepEqual(compatibleCompositions(['S','M','XL']), []);
  assert.equal(normalizeSize(' 2xl '), 'XXL');
});
test('minimum whole packs follows the bottleneck size after real stock', () => {
  const rows = [variant('S',3,1), variant('M',7,2), variant('L',4,1), variant('XL',2,1)];
  assert.equal(minimumPacks(rows,'S/M/L/XL').count, 5);
  assert.equal(minimumPacks(rows,'S/M/M/L/L/XL').count, 3);
  // Two packs provide only four M pieces, short of the five needed.
});
test('unknown stock blocks a numerical result; known zero remains usable', () => {
  assert.deepEqual(minimumPacks([variant('S',2,null)],'S/M/L/XL'), {count:null,reason:'DA CONTARE'});
  assert.equal(minimumPacks([variant('S',2,0)],'S/M/L/XL').count, 2);
  assert.equal(minimumPacks([variant('S',2,-10)],'S/M/L/XL').count, 2);
});
test('stock covering demand needs zero packs; no-demand unknown does not block', () => {
  assert.equal(minimumPacks([variant('S',2,3),variant('M',0,null)],'S/M/L/XL').count, 0);
});
test('XXL demand cannot be silently dropped by a four-size composition', () => {
  assert.equal(minimumPacks([variant('XXL',2,0)],'S/M/L/XL').count, null);
  assert.equal(minimumPacks([variant('XXL',2,0)],'S/M/L/XL/XXL').count, 2);
  assert.equal(minimumPacks([variant('XXL',2,2)],'S/M/L/XL').count, 0);
});
test('colors require independent packs, stock cannot cross colors', () => {
  const red = minimumPacks([variant('M',5,0)],'S/M/M/L/L/XL');
  const blue = minimumPacks([variant('M',2,20)],'S/M/M/L/L/XL');
  assert.equal(red.count + blue.count,3);
});
test('only inventory permission denials permit unknown-stock fallback', () => {
  const denial = { extensions:{code:'ACCESS_DENIED'},path:['product','variants','nodes',0,'inventoryItem','inventoryLevels'] };
  assert(inventoryAccessDenied({body:{errors:{graphQLErrors:[denial]}}}));
  assert(inventoryAccessDenied({errors:[denial]}));
  assert.equal(inventoryAccessDenied({errors:[{extensions:{code:'ACCESS_DENIED'},path:['product']}]}),false);
  assert.equal(inventoryAccessDenied({errors:[{extensions:{code:'THROTTLED'},path:['inventoryLevels']}]}),false);
  assert.equal(inventoryAccessDenied(new Error('network')),false);
});
