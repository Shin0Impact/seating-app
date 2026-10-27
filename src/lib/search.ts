// Name matching that forgives common spelling variants, for Arabic and Latin text.

const TASHKEEL = /[ً-ٰٟـ]/g; // diacritics and tatweel
const ARABIC_DIGITS = /[٠-٩]/g;

/** Lowercases, drops Arabic diacritics and unifies letter variants people type interchangeably. */
export function normalize(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(TASHKEEL, '')
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[أإآٱ]/g, 'ا') // alef with hamza/madda -> alef
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/ؤ/g, 'و') // waw with hamza -> waw
    .replace(/ئ/g, 'ي') // ya with hamza -> ya
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word typed in the query appears somewhere in the fields. */
export function matches(query: string, ...fields: string[]): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.map(normalize).join(' ');
  return words.every((w) => hay.includes(w));
}
