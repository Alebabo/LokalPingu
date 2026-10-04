import type { BusinessProfile, PriceItem, Product } from './memory.ts';
import { draftReply, findMatchingPrices } from './reply.ts';

export interface LocalAssistantContext {
  language: string;
  products: Product[];
  prices: PriceItem[];
  profile: BusinessProfile;
  currency: string;
  newestGuestMessage?: string;
  approvedInteractions: number;
  unreadDemoChats: number;
}

export interface LocalAssistantResult {
  reply: string;
  products: Product[];
  prices: PriceItem[];
}

export function parsePriceAmount(raw: string): number | null {
  const compact = raw.trim().replace(/\s+/g, '');
  if (!/^[+]?\d[\d.,]*$/.test(compact)) return null;
  const unsigned = compact.replace(/^\+/, '');
  const commas = (unsigned.match(/,/g) ?? []).length;
  const dots = (unsigned.match(/\./g) ?? []).length;
  let normalized = unsigned;
  if (commas && dots) {
    const decimal = unsigned.lastIndexOf(',') > unsigned.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    normalized = unsigned.replace(thousands, '').replace(decimal, '.');
  } else if (commas + dots === 1) {
    const separator = commas ? ',' : '.';
    const [whole, fraction = ''] = unsigned.split(separator);
    normalized = fraction.length === 3 ? `${whole}${fraction}` : `${whole}.${fraction}`;
  } else if (commas > 1 || dots > 1) {
    normalized = unsigned.replace(/[.,]/g, '');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null;
}

function localized(language: string, english: string, german: string): string {
  return language === 'de' ? german : english;
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function confirmationBlock(needsOwner: string[]): string {
  return needsOwner.length ? `\n\nCheck before sending: ${needsOwner.join('; ')}.` : '';
}

function formattedPrice(item: PriceItem): string {
  const primary = `${item.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${item.currency}`;
  const local = Number.isFinite(item.localPrice) && item.localCurrency
    ? ` / ${item.localPrice!.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${item.localCurrency}`
    : '';
  return `${primary}${local}${item.unit && item.unit !== 'item' ? ` per ${item.unit}` : ''}`;
}

function offerLines(products: Product[], prices: PriceItem[]): string[] {
  return products.filter((item) => item.active).map((product) => {
    const matches = findMatchingPrices(product.name, prices);
    const price = matches.length === 1 ? ` — ${formattedPrice(matches[0]!)}` : '';
    return `• ${product.name}${price}${product.description ? ` — ${product.description}` : ''}`;
  });
}

export function runLocalAssistant(text: string, context: LocalAssistantContext): LocalAssistantResult {
  const { language, products, prices, profile, currency, newestGuestMessage, approvedInteractions, unreadDemoChats } = context;
  const lower = text.toLowerCase();
  if (/^\s*(?:(?:evaluate|show|review|analyse|analyze|bewerte|zeige)\b.*\b(?:performance|insights?|analysis|leistung|kpis?)\b|(?:performance|insights?|analysis|leistung|kpis?))\s*[?.!]*$/i.test(lower)) {
    const activeProducts = products.filter((item) => item.active).length;
    const activePrices = prices.filter((item) => item.active).length;
    return {
      reply: localized(
        language,
        `Saved local data:\n\n• ${activeProducts} active products\n• ${activePrices} active prices\n• ${unreadDemoChats} unread demo chats\n• ${approvedInteractions} approved interactions saved\n\nMonthly trends are unavailable because this offline demo does not collect analytics.`,
        `Lokal gespeicherte Daten:\n\n• ${activeProducts} aktive Produkte\n• ${activePrices} aktive Preise\n• ${unreadDemoChats} ungelesene Demo-Chats\n• ${approvedInteractions} gespeicherte, freigegebene Interaktionen\n\nMonatliche Trends sind nicht verfügbar, weil diese Offline-Demo keine Analytics erfasst.`,
      ),
      products,
      prices,
    };
  }

  const addMatch = text.match(/^(?:please\s+)?(?:add|create|new|füge|erstelle)\s+(.+?)\s+(?:for|at|für)\s+([+-]?\d[\d.,\s]*)(?:\s+([a-z]{3}))?\s*$/i);
  if (addMatch) {
    const name = addMatch[1]!.trim().replace(/\s+/g, ' ');
    const amount = parsePriceAmount(addMatch[2]!);
    const requestedCurrency = (addMatch[3] || currency).toUpperCase();
    if (!name || name.length > 100 || amount === null) {
      return { reply: localized(language, 'The product name or price is invalid.', 'Produktname oder Preis ist ungültig.'), products, prices };
    }
    if (products.some((item) => normalizedName(item.name) === normalizedName(name))) {
      return { reply: localized(language, `“${name}” already exists.`, `„${name}“ existiert bereits.`), products, prices };
    }
    const id = crypto.randomUUID();
    const product: Product = { id, name, category: 'Offer', description: '', active: true };
    const price: PriceItem = { id: `price-${id}`, label: name, price: amount, currency: requestedCurrency, unit: 'item', active: true };
    return {
      reply: localized(
        language,
        `Done: “${name}” was added at ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${requestedCurrency}. Saved offline on this device.`,
        `Erledigt: „${name}“ wurde für ${amount.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${requestedCurrency} angelegt. Offline auf diesem Gerät gespeichert.`,
      ),
      products: [...products, product],
      prices: [...prices, price],
    };
  }

  const changeMatch = text.match(/^(?:please\s+)?(?:change|set|update|ändere|andere|aktualisiere)\s+(?:the\s+)?(?:price\s+(?:of|for)\s+)?(.+?)(?:\s+price)?\s+(?:to|at|auf)\s+([+-]?\d[\d.,\s]*)(?:\s+([a-z]{3}))?\s*$/i);
  if (changeMatch) {
    const requestedLabel = changeMatch[1]!.trim();
    const amount = parsePriceAmount(changeMatch[2]!);
    const requestedCurrency = (changeMatch[3] || currency).toUpperCase();
    if (amount === null) return { reply: localized(language, 'The new price is invalid.', 'Der neue Preis ist ungültig.'), products, prices };
    const matches = findMatchingPrices(requestedLabel, prices);
    if (matches.length !== 1) {
      return { reply: localized(language, `No unique price entry matches “${requestedLabel}”.`, `Kein eindeutiger Preiseintrag passt zu „${requestedLabel}“.`), products, prices };
    }
    const target = matches[0]!;
    const hadLocalEquivalent = target.localPrice !== undefined || target.localCurrency !== undefined;
    const next = prices.map((item) => item.id === target.id
      ? { ...item, price: amount, currency: requestedCurrency, localPrice: undefined, localCurrency: undefined }
      : item);
    return {
      reply: localized(
        language,
        `Price for “${target.label}” changed to ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${requestedCurrency}.${hadLocalEquivalent ? ' The previous local-currency equivalent was removed because no verified exchange rate is available.' : ''}`,
        `Preis für „${target.label}“ auf ${amount.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${requestedCurrency} geändert.${hadLocalEquivalent ? ' Der bisherige Gegenwert in Lokalwährung wurde entfernt, weil kein bestätigter Wechselkurs vorliegt.' : ''}`,
      ),
      products,
      prices: next,
    };
  }

  if (/(reply|antwort|guest|gast|draft|entwurf)/i.test(lower)) {
    const explicit = text.match(/(?:reply|draft|antwort|entwurf)\s*(?:to|for|für)?\s*:\s*(.+)$/i)?.[1]?.trim();
    const guestMessage = explicit || newestGuestMessage?.trim();
    if (!guestMessage) {
      return { reply: localized(language, 'No guest message is available for a draft.', 'Keine Gästenachricht für einen Entwurf vorhanden.'), products, prices };
    }
    const draft = draftReply(guestMessage, profile, prices);
    return {
      reply: localized(language, 'Draft for the guest (English):\n\n', 'Antwortentwurf für den Gast (Englisch):\n\n') + draft.text + confirmationBlock(draft.needsOwner),
      products,
      prices,
    };
  }

  if (/\b(?:opening hours?|business hours?|when (?:are|is) .*open|hours|öffnungszeiten|wann .*geöffnet|wann .*offen)\b/i.test(text)) {
    const value = profile.openingHours.trim();
    return {
      reply: value
        ? localized(language, `Saved opening hours for ${profile.name || 'the business'}: ${value}`, `Gespeicherte Öffnungszeiten für ${profile.name || 'den Betrieb'}: ${value}`)
        : localized(language, 'Opening hours are not saved yet.', 'Öffnungszeiten sind noch nicht gespeichert.'),
      products,
      prices,
    };
  }

  if (/\b(?:products?|services?|offers?|experiences?|what .*\b(?:offer|sell)|produkte?|angebote?|leistungen?|was .*\b(?:anbiet|verkauf))\b/i.test(text)) {
    const lines = offerLines(products, prices);
    return {
      reply: lines.length
        ? localized(language, `Saved active offers:\n\n${lines.join('\n')}`, `Gespeicherte aktive Angebote:\n\n${lines.join('\n')}`)
        : localized(language, 'No active offers are saved yet.', 'Noch keine aktiven Angebote gespeichert.'),
      products,
      prices,
    };
  }

  if (/\b(?:business profile|about (?:the|our|my) business|business details|betriebsprofil|geschäftsdaten|über (?:den|meinen|unseren) betrieb)\b/i.test(text)) {
    const details = [
      profile.name && `Name: ${profile.name}`,
      profile.owner && `Operator: ${profile.owner}`,
      profile.description && `Description: ${profile.description}`,
      profile.openingHours && `Opening hours: ${profile.openingHours}`,
      profile.location && `Location: ${profile.location}`,
    ].filter(Boolean);
    return {
      reply: details.length
        ? localized(language, `Saved business profile:\n\n${details.join('\n')}`, `Gespeichertes Betriebsprofil:\n\n${details.join('\n')}`)
        : localized(language, 'No business profile is saved yet.', 'Noch kein Betriebsprofil gespeichert.'),
      products,
      prices,
    };
  }

  const grounded = draftReply(text, profile, prices);
  if (grounded.intents.length || grounded.sources.length || grounded.needsOwner.length) {
    return {
      reply: localized(language, 'Answer using saved business data (English):\n\n', 'Antwort mit gespeicherten Business-Daten (Englisch):\n\n')
        + grounded.text
        + confirmationBlock(grounded.needsOwner),
      products,
      prices,
    };
  }

  return {
    reply: localized(
      language,
      'I work offline with saved business data. Try: “Evaluate this month’s performance”, “Change Bag of Fresh Organic Coffee Beans price to 9”, or “Draft a reply for the newest request”.',
      'Ich arbeite offline mit gespeicherten Betriebsdaten. Beispiele: „Evaluate this month’s performance“, „Change Bag of Fresh Organic Coffee Beans price to 9“ oder „Draft a reply for the newest request“.',
    ),
    products,
    prices,
  };
}
