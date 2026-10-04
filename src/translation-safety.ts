export interface TranslationPart {
  text: string;
  translate: boolean;
}

const PROTECTED_LITERAL = /(\b(?:\d{1,2}(?::\d{2})?\s?(?:[aA]\.?[mM]\.?|[pP]\.?[mM]\.?)|\d[\d,.]*\s?(?:USD|EUR|IDR|VUV|THB|BDT|TZS)|\d+(?:[.,]\d+)?|[A-Z][A-Za-z]*(?:-[A-Za-z]+)*(?:\s+(?:&\s+)?[A-Z][A-Za-z]*(?:-[A-Za-z]+)*)+)\b)/g;
const EXACT_PROTECTED_LITERAL = /^(?:\d{1,2}(?::\d{2})?\s?(?:[aA]\.?[mM]\.?|[pP]\.?[mM]\.?)|\d[\d,.]*\s?(?:USD|EUR|IDR|VUV|THB|BDT|TZS)|\d+(?:[.,]\d+)?|[A-Z][A-Za-z]*(?:-[A-Za-z]+)*(?:\s+(?:&\s+)?[A-Z][A-Za-z]*(?:-[A-Za-z]+)*)+)$/;

export function translationParts(text: string): TranslationPart[] {
  return text.split(PROTECTED_LITERAL).filter(Boolean).map((part) => ({
    text: part,
    translate: !EXACT_PROTECTED_LITERAL.test(part) && /\p{L}/u.test(part),
  }));
}
