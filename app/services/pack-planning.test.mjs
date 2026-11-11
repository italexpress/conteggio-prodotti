import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPacks, variantGroup } from './pack-planning.ts';
test('packs cover the scarce size rather than only dividing total pieces', () => {
  const plan = planPacks({ S: 6, M: 2, L: 4 }, {}, 'assorted');
  assert.equal(plan.packs, 6);
  assert.deepEqual(plan.quantities, { S: 6, M: 12, L: 12, XL: 6 });
});
test('existing incoming is subtracted per size without borrowing other sizes', () => {
  assert.equal(planPacks({ S: 6, M: 2 }, { S: 5, M: 100 }, 'assorted').packs, 1);
  assert.equal(planPacks({ S: 6 }, { S: 6 }, 'uniform').packs, 0);
});
test('XXL requires the seven-piece pack and unknown sizes block ordering', () => {
  assert.deepEqual(planPacks({ XXL: 3 }, {}, 'assorted').unsupported, ['XXL']);
  assert.equal(planPacks({ XXL: 3 }, {}, 'assorted', true).packs, 3);
  assert.deepEqual(planPacks({ '48': 1 }, {}, 'uniform').unsupported, ['48']);
});
test('color grouping works regardless of option order', () => {
  assert.deepEqual(variantGroup('M / Nero'), variantGroup('Nero / M'));
  assert.equal(variantGroup('Blu navy / 2XL').size, 'XXL');
});

test('both compositions add exactly one XXL only when the catalog contains it', () => {
  assert.equal(planPacks({ XXL: 2 }, {}, 'uniform', true).quantities.XXL, 2);
  assert.equal(planPacks({ S: 1 }, {}, 'uniform', true).quantities.XXL, 1);
  assert.equal(planPacks({ S: 1 }, {}, 'uniform').quantities.XXL, undefined);
});
test('manual physical stock and incoming remain distinct and both reduce residual', () => {
  const p = planPacks({ M: 8 }, { M: 2 }, 'assorted', false, { M: 2 });
  assert.equal(p.residual.M, 4);
  assert.equal(p.packs, 2);
});
