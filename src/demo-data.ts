import type { BusinessProfile, PriceItem, Product } from './memory';

export const DEMO_SEED_KEY = 'lokalpingu-noor-catalog-v2';

export const NOOR_PROFILE: BusinessProfile = {
  id: 'main',
  language: 'sw',
  name: 'Ondera Heritage Coffee & Farm Tours',
  owner: 'Noor',
  description: 'Family-run coffee farm offering traditional roasting rituals, farm tours and local food.',
  openingHours: 'Mon–Sat 08:00–17:00',
  service: 'Traditional Coffee Tasting & Processing Tour',
  price: 15,
  currency: 'USD',
  checkIn: '08:00',
  capacity: null,
  location: "Ondera Highlands. Take a minibus or boda-boda from the market center to Noor's Coffee Stop; the farm is a 3-minute walk from the main road.",
  allergyPolicy: 'Vegetarian farm-to-table meals are available. Guests should share allergies before arrival.',
  cancellationPolicy: 'Please contact Noor before changing or cancelling a visit.',
  updatedAt: '2026-10-04T00:00:00.000Z',
};

export const NOOR_PRODUCTS: Product[] = [
  { id: 'noor-coffee-tour', name: 'Traditional Coffee Tasting & Processing Tour', category: 'Tour · 2 hours', description: 'From shrub to cup, including roasting over an open fire.', active: true },
  { id: 'noor-local-lunch', name: 'Farm-to-Table Local Lunch', category: 'Food · 1 hour', description: 'Traditional meal prepared with ingredients from the farm.', active: true },
  { id: 'noor-village-walk', name: 'Guided Village & Nature Walk', category: 'Walk · 1.5 hours', description: 'Local plant stories and a scenic viewpoint.', active: true },
  { id: 'noor-coffee-beans', name: 'Bag of Fresh Organic Coffee Beans', category: 'Product · 250 g', description: 'Medium roast coffee beans grown and processed on the farm.', active: true },
];

export const NOOR_PRICES: PriceItem[] = [
  { id: 'noor-price-coffee-tour', label: 'Traditional Coffee Tasting & Processing Tour', price: 15, currency: 'USD', localPrice: 35_000, localCurrency: 'TZS', unit: 'person', active: true },
  { id: 'noor-price-local-lunch', label: 'Farm-to-Table Local Lunch', price: 10, currency: 'USD', localPrice: 23_000, localCurrency: 'TZS', unit: 'person', active: true },
  { id: 'noor-price-village-walk', label: 'Guided Village & Nature Walk', price: 12, currency: 'USD', localPrice: 28_000, localCurrency: 'TZS', unit: 'person', active: true },
  { id: 'noor-price-coffee-beans', label: 'Bag of Fresh Organic Coffee Beans', price: 8, currency: 'USD', localPrice: 18_500, localCurrency: 'TZS', unit: '250 g bag', active: true },
];
