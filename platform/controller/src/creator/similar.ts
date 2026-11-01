// Uniqueness is soft (plan §5): nobody is blocked. Aleatorio prefers looks that differ from everybody in >= 3 fields, and a duplicate gets a gentle notice.
import { CLOTHES_BY_GENDER, FIELDS, randomAppearance, sameAppearance, type Appearance, pick, type Rng } from '@pichi/core';

export interface RosterEntry {
  id: number;
  name: string;
  ap?: Appearance;
}
export const MIN_DIFF = 3;
const TRIES = 40;

export const diffCount = (a: Appearance, b: Appearance): number => FIELDS.filter((f) => a[f] !== b[f]).length;
const nearest = (a: Appearance, others: Appearance[]): number =>
  others.reduce<number>((m, o) => Math.min(m, diffCount(a, o)), FIELDS.length);

/** The name of someone else with exactly this look, or null. Names are cut so a 16-letter name in a wide font still fits two lines. */
export function duplicateOf(ap: Appearance, roster: Iterable<RosterEntry>, myId: number | null): string | null {
  for (const p of roster)
    if (p.id !== myId && p.ap && sameAppearance(ap, p.ap)) return p.name.length > 10 ? `${p.name.slice(0, 10)}…` : p.name;
  return null;
}

/** A random look that keeps `gender` when given (clothes then come from that gender's list) and differs from every other by >= MIN_DIFF fields; after TRIES the best seen. */
export function randomAvoiding(rng: Rng, others: Appearance[], gender: number | null): Appearance {
  let best: Appearance | null = null;
  let bestScore = -1;
  for (let i = 0; i < TRIES; i++) {
    const r = randomAppearance(rng);
    const a = gender === null || r.g === gender ? r : { ...r, g: gender, cl: pick(rng, CLOTHES_BY_GENDER[gender]!) };
    const score = nearest(a, others);
    if (score >= MIN_DIFF) return a;
    if (score > bestScore) [best, bestScore] = [a, score];
  }
  return best!;
}
