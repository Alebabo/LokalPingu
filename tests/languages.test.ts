import assert from 'node:assert/strict';
import test from 'node:test';
import { outboundModelId, supportsReverseTranslation } from '../src/languages.ts';

test('reverse translation is limited to verified dedicated models', () => {
  assert.equal(supportsReverseTranslation('bi'), false);
  assert.equal(supportsReverseTranslation('id'), true);
  assert.equal(supportsReverseTranslation('sw'), false);
  assert.equal(outboundModelId('id'), 'Xenova/opus-mt-id-en');
  assert.throws(() => outboundModelId('bi'), /not verified/);
  assert.throws(() => outboundModelId('sw'), /not verified/);
});
