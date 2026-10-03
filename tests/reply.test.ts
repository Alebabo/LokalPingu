import assert from 'node:assert/strict';
import test from 'node:test';
import { criticalDetails, draftReply } from '../src/reply.ts';
import type { BusinessProfile } from '../src/memory.ts';

const profile: BusinessProfile = {
  id: 'main', language: 'id', name: 'Sari Homestay', service: 'Room per night',
  price: 350000, currency: 'IDR', checkIn: '14:00', capacity: 2,
  location: 'Lombok', allergyPolicy: '', cancellationPolicy: '', updatedAt: '2026-10-03T00:00:00Z'
};

test('critical details remain visible when translation omits them', () => {
  assert.deepEqual(criticalDetails('Two guests arrive tomorrow. One has a peanut allergy.'),
    ['Two guests', 'tomorrow', 'allergy or dietary need']);
});

test('draft uses verified price and asks owner about availability and allergy', () => {
  const draft = draftReply('How much for two guests tomorrow? One has a peanut allergy.', profile);
  assert.match(draft.text, /350,000 IDR/);
  assert.ok(draft.needsOwner.includes('Availability and requested date'));
  assert.ok(draft.needsOwner.includes('Allergy or dietary request'));
});

test('missing price never becomes an invented price', () => {
  const draft = draftReply('How much is a room?', { ...profile, price: null });
  assert.ok(draft.needsOwner.includes('Price'));
  assert.doesNotMatch(draft.text, /\d+ IDR/);
});

test('catalog uses matching saved price without substituting another offer', () => {
  const prices = [
    { id: 'room', label: 'Room per night', price: 350000, currency: 'IDR', unit: 'night', active: true },
    { id: 'tour', label: 'Kayak tour', price: 250000, currency: 'IDR', unit: 'item', active: true },
  ];
  const draft = draftReply('How much is the room?', profile, prices);
  assert.match(draft.text, /350,000 IDR/);
  assert.doesNotMatch(draft.text, /250,000 IDR/);
  const unknown = draftReply('How much is breakfast?', profile, prices);
  assert.ok(unknown.needsOwner.includes('Price'));
  assert.doesNotMatch(unknown.text, /350,000|250,000/);
});

test('free room wording and early check-in require confirmation', () => {
  const room = draftReply('Is a room free next weekend?', profile);
  assert.ok(room.needsOwner.includes('Availability and requested date'));
  assert.ok(room.criticalDetails.includes('whether free means available or no charge'));
  const checkIn = draftReply('Can we check in early?', profile);
  assert.ok(checkIn.needsOwner.includes('Early check-in'));
});
