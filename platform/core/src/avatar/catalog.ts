// Character creator catalogue as DATA (plan creador-personajes §1-§2): option counts, defaults and lists. No drawing lives here (F2 does that).
// Every field is a small integer; `v` is the version. Short keys keep a join around 55 bytes.
export const APPEARANCE_VERSION = 1;

/** Field order of the mixed-radix code (most significant first) and how many values each field has: 3*3*5*4*6*4*6*11 = 285,120. */
export const FIELDS = ['g', 's', 'hc', 'sk', 'hat', 'gl', 'bk', 'cl'] as const;
export type AppearanceField = (typeof FIELDS)[number];
export const FIELD_SIZE: Readonly<Record<AppearanceField, number>> = { g: 3, s: 3, hc: 5, sk: 4, hat: 6, gl: 4, bk: 6, cl: 11 };
export const APPEARANCE_COMBOS = FIELDS.reduce((n, f) => n * FIELD_SIZE[f], 1);

/** Per-field default when a value is missing or invalid (`s` and `cl` also depend on the gender: see styleDefault / clothesDefault). */
export const FIELD_DEFAULT: Readonly<Record<AppearanceField, number>> = { g: 2, s: 2, hc: 1, sk: 1, hat: 0, gl: 0, bk: 0, cl: 0 };

export const GENDER_LABELS = ['Chica', 'Chico', 'Neutro'] as const;
/** Default hairstyle by gender: Chica ponytail (1), Chico short (0), Neutro long (2). */
export const STYLE_BY_GENDER: readonly number[] = [1, 0, 2];
export const STYLE_LABELS = ['corto', 'coleta', 'melena'] as const;
export const HAIR_COLORS = ['#2A211C', '#7A4A2A', '#E9C46A', '#D2603A', '#9C7BE0'] as const;
export const SKIN_TONES = ['#F6D3B8', '#E2AE85', '#B97A50', '#7A4A30'] as const;
/** Clothes are global ids (0-10); each gender is offered 8 of them. The server never enforces the list (the UI filters). */
export const CLOTHES_BY_GENDER: readonly (readonly number[])[] = [
  [8, 9, 3, 7, 2, 5, 10, 1],
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 1, 2, 3, 5, 7, 9, 10],
];

export const styleDefault = (g: number): number => STYLE_BY_GENDER[g] ?? FIELD_DEFAULT.s;
export const clothesDefault = (g: number): number => CLOTHES_BY_GENDER[g]?.[0] ?? FIELD_DEFAULT.cl;
