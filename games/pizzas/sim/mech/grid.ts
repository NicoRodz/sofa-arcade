// Static map reads shared by the validators of the mechanics (rows of letters, 16 wide): where a letter is, what the chefs can reach, and which stations they cannot.
export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
export const STATION_LETTERS = new Set('12345KOPECXULRHMWQY'.split(''));

export const find = (rows: readonly string[], ch: string): [number, number][] =>
  rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === ch ? [[x, y] as [number, number]] : [])));
export const at = (rows: readonly string[], x: number, y: number) => rows[y]?.[x];

/** Tiles reachable from `from`: a step into a tile of letter `c` going (dx, dy) is allowed when `can` says so. Stations and walls are never walked. */
export function reach(
  rows: readonly string[],
  from: readonly [number, number][],
  can: (c: string, dx: number, dy: number) => boolean,
): Set<number> {
  const seen = new Set<number>(from.map(([x, y]) => y * 16 + x));
  const q = [...from];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy,
        c = at(rows, nx, ny);
      if (c === undefined || seen.has(ny * 16 + nx) || c === '#' || c === '~' || STATION_LETTERS.has(c) || !can(c, dx, dy)) continue;
      seen.add(ny * 16 + nx);
      q.push([nx, ny]);
    }
  }
  return seen;
}

/** Does some reached tile touch a station `ch`? */
export const touches = (rows: readonly string[], seen: ReadonlySet<number>, ch: string) =>
  find(rows, ch).some(([x, y]) => DIRS.some(([dx, dy]) => seen.has((y + dy) * 16 + x + dx)));

/** The station letters of the map that nobody standing on `seen` can touch. */
export const cutOff = (rows: readonly string[], seen: ReadonlySet<number>) =>
  [...STATION_LETTERS].filter((ch) => find(rows, ch).length && !touches(rows, seen, ch));

/** Is the kitchen still playable when every letter in `gone` is water? (the bridge is a shortcut and the raft a ferry: neither may be the only way). */
export function playableWithout(rows: readonly string[], gone: string, label: string): string[] {
  const dry = rows.map((r) => [...r].map((c) => (gone.includes(c) ? '~' : c)).join(''));
  const seen = new Set<number>();
  let best: string[] | null = null;
  for (const s of find(dry, 'S')) {
    if (seen.has(s[1] * 16 + s[0])) continue;
    const region = reach(dry, [s], () => true);
    region.forEach((i) => seen.add(i));
    const missing = cutOff(dry, region); // a team is one kitchen: ONE region has to hold every station (items do not cross the water)
    if (!best || missing.length < best.length) best = missing;
  }
  return (best ?? []).map(
    (ch) => `${label}: without it no region of the kitchen reaches the ${ch} (it must be a shortcut, not the only way)`,
  );
}
