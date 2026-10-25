// Seeded PRNG (mulberry32, uint32 state). The game logic never calls Math.random.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;

export function pickWeighted<T extends string>(rng: Rng, weights: Record<T, number>): T {
  const entries = (Object.entries(weights) as [T, number][]).filter(([, w]) => w > 0);
  let r = rng() * entries.reduce((n, [, w]) => n + w, 0);
  for (const [k, w] of entries) if ((r -= w) < 0) return k;
  return entries[entries.length - 1]![0];
}
