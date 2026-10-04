import type { BusinessProfile, PriceItem } from './memory';
import { classifyTourismIntents, type IntentPrediction } from './intent-model.ts';

export interface Draft {
  text: string;
  sources: string[];
  needsOwner: string[];
  criticalDetails: string[];
  intents: IntentPrediction[];
}

const has = (text: string, pattern: RegExp) => pattern.test(text);
const OFFER_STOP_WORDS = new Set([
  'and', 'for', 'from', 'fresh', 'guided', 'local', 'of', 'organic', 'processing',
  'the', 'to', 'traditional', 'tasting',
]);

function normalizedWords(value: string): string[] {
  return (value.normalize('NFKD').toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .map((word) => word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)
    .filter((word) => word.length >= 3 && !OFFER_STOP_WORDS.has(word));
}

export function findMatchingPrices(message: string, catalog: PriceItem[]): PriceItem[] {
  const active = catalog.filter((item) => item.active && Number.isFinite(item.price) && item.price >= 0 && item.currency.trim());
  const messageWords = new Set(normalizedWords(message));
  const scored = active.map((item) => {
    const words = [...new Set(normalizedWords(item.label))];
    const score = words.reduce((sum, word) => sum + (messageWords.has(word) ? 1 : 0), 0);
    return { item, score };
  }).filter(({ score }) => score > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map(({ score }) => score));
  const matches = scored.filter(({ score }) => score === best).map(({ item }) => item);
  return matches.length === 1 ? matches : [];
}

function readableList(items: string[]): string {
  if (items.length < 2) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function priceSentence(item: PriceItem): string {
  const primary = `${item.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${item.currency}`;
  const local = Number.isFinite(item.localPrice) && item.localPrice! >= 0 && item.localCurrency
    ? ` / ${item.localPrice!.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${item.localCurrency}`
    : '';
  const unit = item.unit && item.unit !== 'item' ? ` per ${item.unit}` : '';
  return `${item.label} costs ${primary}${local}${unit}.`;
}

export function criticalDetails(message: string): string[] {
  const details = new Set<string>();
  const patterns = [
    /\b(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/gi,
    /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b/gi,
    /\b\d{1,2}:\d{2}\b/gi,
    /\b\d+(?:[.,]\d+)?\s?(?:people|persons|guests|adults|children|rooms|nights|bags|items|tours|meals|USD|EUR|IDR|VUV|THB|BDT|TZS)\b/gi,
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:people|persons|guests|adults|children|rooms|nights|bags|items|tours|meals|of us)\b/gi,
    /\b\d{1,2}[- ]year[- ]old(?:\s+child)?\b/gi,
    /\b(?:(?:this|next)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekend)|today|tomorrow|tonight\b/gi,
    /\b(?:morning|afternoon|evening)\b/gi,
  ];
  for (const pattern of patterns) for (const match of message.matchAll(pattern)) details.add(match[0]);
  if (has(message, /allerg|peanut|nut-free|gluten|shellfish|dairy|vegetarian|vegan/i)) details.add('allergy or dietary need');
  if (has(message, /\b(?:room|rooms)\b.*\bfree\b|\bfree\b.*\b(?:room|rooms)\b/i)) details.add('whether free means available or no charge');
  if (has(message, /\b(?:cash|card|mobile money|payment|pay)\b/i)) details.add('requested payment method');
  if (has(message, /\b(?:rains?|weather|storms?)\b/i)) details.add('weather plan');
  if (has(message, /\b(?:pick.?up|collect|transfer)\b/i)) details.add('pickup or collection request');
  return [...details];
}

export function draftReply(message: string, profile: BusinessProfile, catalog: PriceItem[] = []): Draft {
  const text = message.trim();
  const intents = classifyTourismIntents(text);
  const inferred = new Set(intents.map((intent) => intent.label));
  const sentences: string[] = [];
  const sources: string[] = [];
  const needsOwner: string[] = [];
  const details = criticalDetails(text);
  const activePrices = catalog.filter((item) => item.active && Number.isFinite(item.price) && item.price >= 0 && item.currency.trim());
  const matchingPrices = findMatchingPrices(text, activePrices);

  if (has(text, /price|cost|rate|how much|charge/i) || inferred.has('price')) {
    const relevantPrices = matchingPrices.length ? matchingPrices : activePrices.length === 1 ? activePrices : [];
    if (relevantPrices.length) {
      for (const item of relevantPrices) sentences.push(priceSentence(item));
      sources.push('Owner-saved price list');
    } else if (activePrices.length === 0 && profile.price !== null && Number.isFinite(profile.price) && profile.price >= 0 && profile.currency && profile.service) {
      sentences.push(`${profile.service} costs ${profile.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${profile.currency}.`);
      sources.push('Service, price and currency in business profile');
    } else {
      needsOwner.push(activePrices.length > 1 && !matchingPrices.length ? 'Which offer and price' : 'Price');
    }
  }
  if (has(text, /breakfast.*included|included.*breakfast/i)) needsOwner.push('Whether breakfast is included');
  if (has(text, /where|address|location|directions|find you|reach|taxi|minibus|town center|market/i) || inferred.has('location')) {
    if (profile.location) {
      sentences.push(`Our saved directions are: ${profile.location}`);
      sources.push('Location in business profile');
    } else needsOwner.push('Location or directions');
  }
  if (has(text, /check.?in|arrival|what time/i) || inferred.has('checkin')) {
    if (profile.checkIn) {
      sentences.push(`Check-in starts at ${profile.checkIn}.`);
      sources.push('Check-in time in business profile');
    } else needsOwner.push('Check-in time');
    if (has(text, /early|before\s+(?:the\s+)?check.?in|arriv\w*.*before/i)) needsOwner.push('Early check-in');
  }
  if (has(text, /how many|capacity|group|people|guests|persons/i) || inferred.has('capacity')) {
    if (profile.capacity !== null && Number.isFinite(profile.capacity) && profile.capacity >= 0) {
      sentences.push(`Maximum capacity is ${profile.capacity} guests.`);
      sources.push('Capacity in business profile');
    } else needsOwner.push('Capacity');
  }
  if (has(text, /allerg|peanut|nut-free|gluten|shellfish|dairy|vegetarian|vegan/i) || inferred.has('dietary')) {
    if (profile.allergyPolicy) {
      sentences.push(`Our saved dietary policy says: ${profile.allergyPolicy}`);
      sources.push('Owner-confirmed dietary policy in business profile');
    }
    if (has(text, /allerg|peanut|nut-free|gluten|shellfish|dairy/i)) needsOwner.push('Allergy or dietary request');
    else if (!profile.allergyPolicy) needsOwner.push('Dietary request');
  }
  if (has(text, /cancel|refund/i) || inferred.has('cancellation')) {
    if (profile.cancellationPolicy) {
      sentences.push(profile.cancellationPolicy);
      sources.push('Cancellation policy in business profile');
    } else needsOwner.push('Cancellation policy');
  }
  if (has(text, /\b(?:child|children|kid|age|suitable|accessible|wheelchair)\b/i) || inferred.has('suitability')) needsOwner.push('Age or accessibility suitability');
  if (has(text, /\b(?:rains?|weather|storms?)\b/i) || inferred.has('weather')) needsOwner.push('Weather plan');
  if (has(text, /\b(?:cash|card|mobile money|payment|pay)\b/i) || inferred.has('payment')) needsOwner.push('Accepted payment methods');
  if (has(text, /\b(?:arrange|provide|offer)\s+(?:a\s+)?pick.?up|\bpick.?up\s+from\b|\b(?:collect|pick.?up)\s+(?:us|me)\b|\btransfer\b/i)) needsOwner.push('Pickup or transport arrangement');
  if (has(text, /\b(?:pick.?up|collect)\b.*\b(?:bags?|beans?|products?|orders?)\b|\b(?:bags?|beans?|products?|orders?)\b.*\b(?:pick.?up|collect)\b/i)) needsOwner.push('Product collection time');
  if (has(text, /\b(?:available|availability|book|reserve|planning|visit|today|tomorrow|tonight|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:room|rooms)\b.*\bfree\b|\bfree\b.*\b(?:room|rooms)\b/i) || inferred.has('availability')) {
    needsOwner.push('Availability and requested date');
  }

  const uniqueNeeds = [...new Set(needsOwner)];
  const prefix = profile.name ? `Thank you for contacting ${profile.name}.` : 'Thank you for your message.';
  if (!sentences.length && !uniqueNeeds.length) sentences.push('How can we help with your visit?');
  const question = uniqueNeeds.length ? ` We need to confirm ${readableList(uniqueNeeds.map((item) => item.toLowerCase()))} before making a promise.` : '';
  return { text: [prefix, ...sentences].join(' ') + question, sources, needsOwner: uniqueNeeds, criticalDetails: details, intents };
}
