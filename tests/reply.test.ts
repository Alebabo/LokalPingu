import assert from 'node:assert/strict';
import test from 'node:test';
import { criticalDetails, draftReply } from '../src/reply.ts';
import type { BusinessProfile } from '../src/memory.ts';
import { NOOR_PRICES, NOOR_PROFILE } from '../src/demo-data.ts';

const profile: BusinessProfile = {
  id: 'main', language: 'id', name: 'Sari Homestay', service: 'Room per night',
  owner: 'Sari', description: 'Family homestay', openingHours: 'Daily 08:00–18:00',
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
  assert.ok(unknown.needsOwner.includes('Which offer and price'));
  assert.doesNotMatch(unknown.text, /350,000|250,000/);
});

test('free room wording and early check-in require confirmation', () => {
  const room = draftReply('Is a room free next weekend?', profile);
  assert.ok(room.needsOwner.includes('Availability and requested date'));
  assert.ok(room.criticalDetails.includes('whether free means available or no charge'));
  const checkIn = draftReply('Can we check in early?', profile);
  assert.ok(checkIn.needsOwner.includes('Early check-in'));
});

test('default offer matching never mixes coffee tour, beans, lunch and walk', () => {
  const tour = draftReply('How much is the coffee tour?', NOOR_PROFILE, NOOR_PRICES);
  assert.match(tour.text, /Coffee Tasting & Processing Tour costs 15 USD \/ 35,000 TZS/);
  assert.doesNotMatch(tour.text, /Coffee Beans costs|Local Lunch costs|Nature Walk costs/);

  const beans = draftReply('How much are the coffee beans?', NOOR_PROFILE, NOOR_PRICES);
  assert.match(beans.text, /Coffee Beans costs 8 USD \/ 18,500 TZS/);
  assert.doesNotMatch(beans.text, /Processing Tour costs/);

  const walk = draftReply('What is the price of the village walk?', NOOR_PROFILE, NOOR_PRICES);
  assert.match(walk.text, /Village & Nature Walk costs 12 USD \/ 28,000 TZS/);
  assert.doesNotMatch(walk.text, /Local Lunch costs/);

  const ambiguous = draftReply('What is the coffee price?', NOOR_PROFILE, NOOR_PRICES);
  assert.ok(ambiguous.needsOwner.includes('Which offer and price'));
  assert.doesNotMatch(ambiguous.text, /costs \d/);
});

test('all seeded guest edge cases receive grounded answers or explicit checks', () => {
  const lunch = draftReply('Hello Noor, can four of us book lunch this Saturday at 1 PM? One guest is vegetarian and has a peanut allergy.', NOOR_PROFILE, NOOR_PRICES);
  assert.match(lunch.text, /saved dietary policy/i);
  assert.ok(lunch.needsOwner.includes('Allergy or dietary request'));
  assert.ok(lunch.needsOwner.includes('Availability and requested date'));
  assert.ok(lunch.criticalDetails.includes('four of us'));
  assert.ok(lunch.criticalDetails.includes('this Saturday'));
  assert.ok(lunch.criticalDetails.includes('1 PM'));

  const walk = draftReply('Is the village walk suitable for a 7-year-old child, and what is the price for three people?', NOOR_PROFILE, NOOR_PRICES);
  assert.match(walk.text, /Nature Walk costs 12 USD \/ 28,000 TZS/);
  assert.doesNotMatch(walk.text, /Local Lunch costs/);
  assert.ok(walk.needsOwner.includes('Age or accessibility suitability'));
  assert.ok(walk.criticalDetails.includes('7-year-old child'));

  const beans = draftReply('Can I pick up two bags of coffee beans today? Can I pay with cash or by card?', NOOR_PROFILE, NOOR_PRICES);
  assert.ok(beans.needsOwner.includes('Product collection time'));
  assert.ok(beans.needsOwner.includes('Accepted payment methods'));
  assert.ok(beans.needsOwner.includes('Availability and requested date'));
  assert.ok(beans.criticalDetails.includes('two bags'));

  const transfer = draftReply('Could you arrange pickup from Ondera Market tomorrow morning, or should we take the local minibus?', NOOR_PROFILE, NOOR_PRICES);
  assert.match(transfer.text, /saved directions/i);
  assert.ok(transfer.needsOwner.includes('Pickup or transport arrangement'));

  const rain = draftReply('We are planning the coffee tour on Friday. Does the tour still happen if it rains?', NOOR_PROFILE, NOOR_PRICES);
  assert.ok(rain.needsOwner.includes('Weather plan'));
  assert.ok(rain.needsOwner.includes('Availability and requested date'));

  const vegetarian = draftReply('Is there a vegetarian option for lunch?', NOOR_PROFILE, NOOR_PRICES);
  assert.match(vegetarian.text, /Vegetarian farm-to-table meals are available/);
});

test('empty and unsupported messages produce a useful safe response', () => {
  const empty = draftReply('   ', NOOR_PROFILE, NOOR_PRICES);
  assert.match(empty.text, /How can we help with your visit/);
  assert.deepEqual(empty.needsOwner, []);
  assert.deepEqual(empty.sources, []);
});
