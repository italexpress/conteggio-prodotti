import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compatibleCompositions, minimumPacks, normalizeSize, summarizePacks } from './packs.ts';
const variant = (size, demand, stock) => ({ id: size, size, demand, stock, group: '', sku: size });
test('only real Shopify sizes enable compositions and XXL is conditional', () => {
  assert.deepEqual(compatibleCompositions(['S','M','L','XL']), ['S/M/L/XL','S/M/M/L/L/XL']);
  assert.equal(compatibleCompositions(['S','M','L','XL','XXL']).length,4);
  assert.deepEqual(compatibleCompositions(['S','M','XL']),[]);
  assert.equal(normalizeSize(' 2xl '),'XXL');
});
test('whole packs cover the most demanding size without subtracting stock', () => {
  const rows = [variant('S',3,100),variant('M',7,100),variant('L',4,100),variant('XL',2,100)];
  assert.equal(minimumPacks(rows,'S/M/L/XL').count,7);
  assert.equal(minimumPacks(rows,'S/M/M/L/L/XL').count,4);
});
test('unknown, zero, positive and absent stocks do not change the result', () => {
  for (const stock of [null,0,100,undefined,-10]) {
    assert.deepEqual(minimumPacks([variant('M',5,stock)],'S/M/M/L/L/XL'),{count:3,reason:null});
  }
});
test('no outstanding demand needs zero packs', () => {
  assert.equal(minimumPacks([variant('S',0,null)],'S/M/L/XL').count,0);
});
test('unsupported XXL demand remains blocked regardless of stock', () => {
  assert.equal(minimumPacks([variant('XXL',2,100)],'S/M/L/XL').count,null);
  assert.equal(minimumPacks([variant('XXL',2,null)],'S/M/L/XL/XXL').count,2);
});
test('colors require independent packs', () => {
  const red = minimumPacks([variant('M',5,null)],'S/M/M/L/L/XL');
  const blue = minimumPacks([variant('M',2,100)],'S/M/M/L/L/XL');
  assert.equal(red.count+blue.count,4);
});
test('remaining pieces are the excess from whole packs, never warehouse stock',()=>{
 const rows=[variant('S',3,999),variant('M',7,999),variant('L',4,999),variant('XL',2,999)];
 const plan=summarizePacks(rows,'S/M/M/L/L/XL');
 assert.equal(plan.count,4);
 assert.equal(plan.remaining,8); // 4 packs * 6 pieces - 16 sold
 assert.deepEqual(plan.sold,{S:3,M:7,L:4,XL:2});
 assert.equal(summarizePacks([variant('S',0,null)],'S/M/L/XL').remaining,0);
 assert.equal(summarizePacks(rows,'').remaining,null);
});
