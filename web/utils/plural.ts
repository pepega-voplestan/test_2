/**
 * Russian pluralisation (declension) for counted nouns.
 *
 * Russian picks one of three forms based on the count:
 *   one     — 1, 21, 31, 101…            (файл)
 *   few     — 2–4, 22–24…                (файла)
 *   many    — 0, 5–20, 25–30, 11–14…     (файлов)
 *
 * The 11–14 exception is the one that naive implementations get wrong: 11 ends
 * in 1 but takes the `many` form, and 12–14 end in 2–4 but also take `many`.
 *
 * Required by Constitution Principle II (Russian-Language UI Integrity): counted
 * strings must never be built by concatenation.
 */

export type PluralForms = {
  /** 1 файл */
  one: string;
  /** 2 файла */
  few: string;
  /** 5 файлов */
  many: string;
};

/** Pick the correct Russian form for `count`. */
export function plural(count: number, forms: PluralForms): string {
  const n = Math.abs(Math.trunc(count));
  const mod100 = n % 100;
  const mod10 = n % 10;

  if (mod100 >= 11 && mod100 <= 14) return forms.many;
  if (mod10 === 1) return forms.one;
  if (mod10 >= 2 && mod10 <= 4) return forms.few;
  return forms.many;
}

/** "3 файла" — count followed by its correctly declined noun. */
export function pluralize(count: number, forms: PluralForms): string {
  return `${count} ${plural(count, forms)}`;
}

/* ---------- Shared noun sets for media galleries (feature 006) ---------- */

export const FILE_FORMS: PluralForms = { one: 'файл', few: 'файла', many: 'файлов' };

export const IMAGE_FORMS: PluralForms = {
  one: 'изображение',
  few: 'изображения',
  many: 'изображений',
};
