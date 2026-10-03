import type { BusinessProfile, PriceItem } from './memory';

export interface Draft {
  text: string;
  sources: string[];
  needsOwner: string[];
  criticalDetails: string[];
}

const has = (text: string, pattern: RegExp) => pattern.test(text);

export function criticalDetails(message: string): string[] {
  const details = new Set<string>();
  for (const match of message.matchAll(/\b(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}|\d+(?:[.,]\d+)?\s?(?:people|persons|guests|adults|children|rooms|nights|USD|EUR|IDR|VUV|THB|BDT))\b/gi)) {
    details.add(match[0]);
  }
  for (const match of message.matchAll(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:people|persons|guests|adults|children|rooms|nights)\b/gi)) {
    details.add(match[0]);
  }
  for (const match of message.matchAll(/\b(?:today|tomorrow|tonight|next week|next weekend)\b/gi)) {
    details.add(match[0]);
  }
  if (has(message, /allerg|peanut|nut-free|gluten|shellfish|dairy/i)) details.add('allergy or dietary need');
  if (has(message, /\b(?:room|rooms)\b.*\bfree\b|\bfree\b.*\b(?:room|rooms)\b/i)) details.add('whether free means available or no charge');
  return [...details];
}

export function draftReply(message: string, profile: BusinessProfile, catalog: PriceItem[] = []): Draft {
  const text = message.trim();
  const sentences: string[] = [];
  const sources: string[] = [];
  const needsOwner: string[] = [];
  const details = criticalDetails(text);
  const activePrices = catalog.filter((item) => item.active && Number.isFinite(item.price) && item.price >= 0 && item.currency);
  const matchingPrices = activePrices.filter((item) => item.label.toLowerCase().split(/[^a-z]+/).some((word) => word.length >= 4 && text.toLowerCase().includes(word)));

  if (has(text, /price|cost|rate|how much|charge/i)) {
    const relevantPrices = matchingPrices.length ? matchingPrices : activePrices.length === 1 ? activePrices : [];
    if (relevantPrices.length) {
      for (const item of relevantPrices) sentences.push(`${item.label} costs ${item.price.toLocaleString('en-US')} ${item.currency}${item.unit && item.unit !== 'item' ? ` per ${item.unit}` : ''}.`);
      sources.push('Owner-saved price list');
    } else if (activePrices.length === 0 && profile.price !== null && profile.currency && profile.service) {
      sentences.push(`${profile.service} costs ${profile.price.toLocaleString('en-US')} ${profile.currency}.`);
      sources.push('Service, price and currency in business profile');
    } else needsOwner.push('Price');
  }
  if (has(text, /breakfast.*included|included.*breakfast/i)) needsOwner.push('Whether breakfast is included');
  if (has(text, /where|address|location|directions|find you/i)) {
    if (profile.location) {
      sentences.push(`Our location is ${profile.location}.`);
      sources.push('Location in business profile');
    } else needsOwner.push('Location');
  }
  if (has(text, /check.?in|arrival|what time/i)) {
    if (profile.checkIn) {
      sentences.push(`Check-in starts at ${profile.checkIn}.`);
      sources.push('Check-in time in business profile');
    } else needsOwner.push('Check-in time');
    if (has(text, /early/i)) needsOwner.push('Early check-in');
  }
  if (has(text, /how many|capacity|group|people|guests|persons/i)) {
    if (profile.capacity !== null) {
      sentences.push(`Maximum capacity is ${profile.capacity} guests.`);
      sources.push('Capacity in business profile');
    } else needsOwner.push('Capacity');
  }
  if (has(text, /allerg|peanut|nut-free|gluten|shellfish|dairy/i)) {
    if (profile.allergyPolicy) {
      sentences.push(`Our recorded dietary policy is: ${profile.allergyPolicy}`);
      sources.push('Owner-confirmed dietary policy in business profile');
    }
    needsOwner.push('Allergy or dietary request');
  }
  if (has(text, /cancel|refund/i)) {
    if (profile.cancellationPolicy) {
      sentences.push(profile.cancellationPolicy);
      sources.push('Cancellation policy in business profile');
    } else needsOwner.push('Cancellation policy');
  }
  if (has(text, /available|availability|book|reserve|date|tonight|tomorrow|weekend|\b(?:room|rooms)\b.*\bfree\b|\bfree\b.*\b(?:room|rooms)\b/i)) {
    needsOwner.push('Availability and requested date');
  }
  const prefix = profile.name ? `Thank you for contacting ${profile.name}.` : 'Thank you for your message.';
  const question = needsOwner.length ? ' We will confirm ' + [...new Set(needsOwner)].join(', ').toLowerCase() + ' before making a promise.' : '';
  return { text: [prefix, ...sentences].join(' ') + question, sources, needsOwner: [...new Set(needsOwner)], criticalDetails: details };
}
