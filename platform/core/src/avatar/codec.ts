import { APPEARANCE_COMBOS, APPEARANCE_VERSION, FIELDS, FIELD_SIZE } from './catalog';
import type { Appearance } from './appearance';

/** Canonical code: the eight fields as one mixed-radix integer (< 2^19), written in base36 and padded to 4 chars. For tests, hashes and capture names; it never travels. */
export const CODE_LEN = 4;

export function encodeAppearance(a: Appearance): string {
  let n = 0;
  for (const f of FIELDS) n = n * FIELD_SIZE[f] + a[f];
  return n.toString(36).padStart(CODE_LEN, '0');
}

/** The inverse; null for anything that is not a code this module wrote (wrong length, characters, or out of range). */
export function decodeAppearance(code: string): Appearance | null {
  if (typeof code !== 'string' || !/^[0-9a-z]{4}$/.test(code)) return null;
  let n = Number.parseInt(code, 36);
  if (n >= APPEARANCE_COMBOS) return null;
  const out: Record<string, number> = {};
  for (let i = FIELDS.length - 1; i >= 0; i--) {
    const f = FIELDS[i]!;
    out[f] = n % FIELD_SIZE[f];
    n = Math.floor(n / FIELD_SIZE[f]);
  }
  return { v: APPEARANCE_VERSION, ...out } as Appearance;
}
