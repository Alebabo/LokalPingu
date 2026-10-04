export const languages = [
  { code: 'bi', name: 'Bislama', country: 'Vanuatu', opusTag: null },
  { code: 'th', name: 'ไทย / Thai', country: 'Thailand', opusTag: 'tha' },
  { code: 'id', name: 'Bahasa Indonesia', country: 'Indonesia', opusTag: 'ind' },
  { code: 'bn', name: 'বাংলা / Bangla', country: 'Bangladesh', opusTag: 'ben' },
  { code: 'hi', name: 'हिन्दी / Hindi', country: 'India', opusTag: 'hin' },
  { code: 'ta', name: 'தமிழ் / Tamil', country: 'India and Sri Lanka', opusTag: 'tam' },
  { code: 'sw', name: 'Kiswahili', country: 'Kenya and Tanzania', opusTag: 'swh' },
  { code: 'vi', name: 'Tiếng Việt', country: 'Vietnam', opusTag: 'vie' },
  { code: 'km', name: 'ភាសាខ្មែរ / Khmer', country: 'Cambodia', opusTag: 'khm' },
  { code: 'ne', name: 'नेपाली / Nepali', country: 'Nepal', opusTag: 'npi' }
] as const;

export type LanguageCode = typeof languages[number]['code'];

export function isLanguageCode(value: string): value is LanguageCode {
  return languages.some((language) => language.code === value);
}

export function modelId(code: LanguageCode): string {
  if (code === 'bi') return 'LokalPingu/opus-mt-en-bi';
  if (code === 'id') return 'Xenova/opus-mt-en-id';
  if (code === 'sw') return 'LokalPingu/opus-mt-en-sw';
  return 'Xenova/opus-mt-en-mul';
}

export function supportsReverseTranslation(code: LanguageCode): boolean {
  return code === 'id';
}

export function outboundModelId(code: LanguageCode): string {
  if (code === 'id') return 'Xenova/opus-mt-id-en';
  throw new Error('Local-to-English translation is not verified for this language.');
}

