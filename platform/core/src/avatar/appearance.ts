import { APPEARANCE_VERSION, FIELDS, FIELD_DEFAULT, FIELD_SIZE, clothesDefault, styleDefault, type AppearanceField } from './catalog';
import { mulberry32 } from '../rng';
import { randomAppearance } from './random';

/** What a player looks like: version plus eight small integers (see catalog.ts for the ranges). */
export interface Appearance {
  v: 1;
  g: number;
  s: number;
  hc: number;
  sk: number;
  hat: number;
  gl: number;
  bk: number;
  cl: number;
}

/** The look of a phone that sent none (an old client) or garbage: a seeded random one, so two old phones also differ. */
export const defaultAppearance = (slot: number): Appearance => randomAppearance(mulberry32(Number.isInteger(slot) ? slot : 0));

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};
export const isPlainObject = isPlain;

const inRange = (v: unknown, size: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < size;

/**
 * Pure and total: never throws and never refuses (a join is never rejected for its look). Reads only the known keys, each with Object.hasOwn
 * (no spread, no Object.assign, so `__proto__` and friends cannot leak in). A bad field takes its own default; `s` and `cl` default by the sanitized gender.
 * Not a plain object, or a version other than 1 (nothing to migrate yet): the whole slot default. A missing `v` is read as 1.
 * It does not check that `cl` is in the gender's list: the UI filters, the server imposes nothing.
 */
export function sanitizeAppearance(raw: unknown, slot: number): Appearance {
  if (!isPlain(raw)) return defaultAppearance(slot);
  if (Object.hasOwn(raw, 'v') && raw.v !== APPEARANCE_VERSION) return defaultAppearance(slot);
  const pick = (f: AppearanceField, fallback: number): number => {
    const v = Object.hasOwn(raw, f) ? raw[f] : undefined;
    return inRange(v, FIELD_SIZE[f]) ? v : fallback;
  };
  const g = pick('g', FIELD_DEFAULT.g);
  return {
    v: APPEARANCE_VERSION,
    g,
    s: pick('s', styleDefault(g)),
    hc: pick('hc', FIELD_DEFAULT.hc),
    sk: pick('sk', FIELD_DEFAULT.sk),
    hat: pick('hat', FIELD_DEFAULT.hat),
    gl: pick('gl', FIELD_DEFAULT.gl),
    bk: pick('bk', FIELD_DEFAULT.bk),
    cl: pick('cl', clothesDefault(g)),
  };
}

export const sameAppearance = (a: Appearance, b: Appearance): boolean => FIELDS.every((f) => a[f] === b[f]);
