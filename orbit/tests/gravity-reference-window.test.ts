import test from 'node:test';
import assert from 'node:assert/strict';
import { compareGravityReferenceWindow } from './gravity-reference-window-check';

test('GRAIL N30 regression seed propagation matches independent SPICE reference over +/-1/3/7 TDB days', async () => {
  const result = await compareGravityReferenceWindow();
  assert.ok(result.passed, JSON.stringify(result, null, 2));
});
