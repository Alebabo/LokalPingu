import assert from 'node:assert/strict';
import test from 'node:test';
import { runLocalAssistant, parsePriceAmount } from '../src/local-assistant.ts';
import { NOOR_PRICES, NOOR_PRODUCTS, NOOR_PROFILE } from '../src/demo-data.ts';

const context = {
  language: 'en',
  products: NOOR_PRODUCTS,
  prices: NOOR_PRICES,
  profile: NOOR_PROFILE,
  currency: 'USD',
  newestGuestMessage: 'Can four of us book lunch this Saturday at 1 PM? One guest has a peanut allergy.',
  approvedInteractions: 0,
  unreadDemoChats: 5,
};

test('price parser handles decimal and thousands separators without changing value', () => {
  assert.equal(parsePriceAmount('9'), 9);
  assert.equal(parsePriceAmount('9.50'), 9.5);
  assert.equal(parsePriceAmount('9,50'), 9.5);
  assert.equal(parsePriceAmount('35,000'), 35000);
  assert.equal(parsePriceAmount('35.000'), 35000);
  assert.equal(parsePriceAmount('1,234.56'), 1234.56);
  assert.equal(parsePriceAmount('1.234,56'), 1234.56);
  assert.equal(parsePriceAmount('-5'), null);
  assert.equal(parsePriceAmount('NaN'), null);
  assert.equal(parsePriceAmount('1000000001'), null);
});

test('performance response only reports passed local data', () => {
  const result = runLocalAssistant("Evaluate this month's performance", context);
  assert.match(result.reply, /4 active products/);
  assert.match(result.reply, /5 unread demo chats/);
  assert.match(result.reply, /Analytics collection stays off/);
  assert.doesNotMatch(result.reply, /28 guest requests|65%|most praised/i);
});

test('price update targets one saved offer and rejects unsafe values', () => {
  const changed = runLocalAssistant('Change Bag of Fresh Organic Coffee Beans price to 9', context);
  assert.equal(changed.prices.find((item) => item.id === 'noor-price-coffee-beans')?.price, 9);
  assert.equal(changed.prices.find((item) => item.id === 'noor-price-coffee-beans')?.localPrice, undefined);
  assert.match(changed.reply, /local-currency equivalent was removed/);
  assert.equal(changed.prices.find((item) => item.id === 'noor-price-coffee-tour')?.price, 15);

  const negative = runLocalAssistant('Change Bag of Fresh Organic Coffee Beans price to -5', context);
  assert.match(negative.reply, /invalid/i);
  assert.deepEqual(negative.prices, NOOR_PRICES);

  const ambiguous = runLocalAssistant('Change coffee price to 9', context);
  assert.match(ambiguous.reply, /No unique price entry/);
  assert.deepEqual(ambiguous.prices, NOOR_PRICES);
});

test('command words inside a product name do not trigger fabricated analytics', () => {
  const result = runLocalAssistant('Add Performance Tour for 12 USD', context);
  assert.equal(result.products.at(-1)?.name, 'Performance Tour');
  assert.doesNotMatch(result.reply, /Monthly trends/);
});

test('add command preserves amount, currency and blocks duplicates', () => {
  const added = runLocalAssistant('Add Sunset Tea for 35,000 TZS', context);
  assert.equal(added.products.at(-1)?.name, 'Sunset Tea');
  assert.equal(added.prices.at(-1)?.price, 35000);
  assert.equal(added.prices.at(-1)?.currency, 'TZS');

  const duplicate = runLocalAssistant('Add Farm-to-Table Local Lunch for 20 USD', context);
  assert.match(duplicate.reply, /already exists/);
  assert.equal(duplicate.products.length, 4);
});

test('newest-request draft uses guest message and exposes confirmations', () => {
  const result = runLocalAssistant('Draft a reply for the newest request', context);
  assert.match(result.reply, /Draft for the guest \(English\)/);
  assert.match(result.reply, /dietary policy/i);
  assert.match(result.reply, /Check before sending:.*Allergy or dietary request/);
  assert.doesNotMatch(result.reply, /Our current prices:/);
});

test('free-text questions use saved business facts without a draft command', () => {
  const result = runLocalAssistant('How much is the village walk and where is the farm?', context);
  assert.match(result.reply, /Answer using saved business data/);
  assert.match(result.reply, /Village & Nature Walk costs 12 USD \/ 28,000 TZS/);
  assert.match(result.reply, /Ondera Highlands/);
  assert.doesNotMatch(result.reply, /Coffee Tasting.*costs 15 USD/);
});

test('assistant can read saved offers and opening hours', () => {
  const offers = runLocalAssistant('What services do we offer?', context);
  assert.match(offers.reply, /Saved active offers/);
  assert.match(offers.reply, /Traditional Coffee Tasting & Processing Tour — 15 USD \/ 35,000 TZS per person/);
  assert.match(offers.reply, /Farm-to-Table Local Lunch — 10 USD \/ 23,000 TZS per person/);

  const hours = runLocalAssistant('What are our opening hours?', context);
  assert.match(hours.reply, /Mon–Sat 08:00–17:00/);
});

test('unsupported text does not dump private business context', () => {
  const result = runLocalAssistant('Write a poem about mountains.', context);
  assert.doesNotMatch(result.reply, /Ondera Highlands|35,000 TZS|Noor/);
  assert.match(result.reply, /I work offline with saved business data/);
});
