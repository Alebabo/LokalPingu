import assert from 'node:assert/strict';
import test from 'node:test';
import { translationParts } from '../src/translation-safety.ts';

test('translation safety preserves prices, currencies, times and standalone numbers', () => {
  const input = 'Tour costs 15 USD / 35,000 TZS. Confirm 2 PM for 2 guests on 2026-10-04.';
  const protectedValues = translationParts(input).filter((part) => !part.translate).map((part) => part.text);
  assert.ok(protectedValues.includes('15 USD'));
  assert.ok(protectedValues.includes('35,000 TZS'));
  assert.ok(protectedValues.includes('2 PM'));
  assert.ok(protectedValues.includes('2'));
  assert.ok(protectedValues.includes('2026'));
  assert.ok(protectedValues.includes('10'));
  assert.ok(protectedValues.includes('04'));
});

test('translation safety leaves prose available to the model', () => {
  const parts = translationParts('Please confirm 2 PM tomorrow.');
  assert.equal(parts.map((part) => part.text).join(''), 'Please confirm 2 PM tomorrow.');
  assert.equal(parts.find((part) => part.text === '2 PM')?.translate, false);
  assert.ok(parts.some((part) => part.translate && part.text.includes('Please confirm')));
});

test('translation safety preserves saved English offer and business names', () => {
  const input = 'Traditional Coffee Tasting & Processing Tour is offered by Ondera Heritage Coffee & Farm Tours.';
  const protectedValues = translationParts(input).filter((part) => !part.translate).map((part) => part.text);
  assert.ok(protectedValues.includes('Traditional Coffee Tasting & Processing Tour'));
  assert.ok(protectedValues.includes('Ondera Heritage Coffee & Farm Tours'));
});
