// The operations of the v2 mutation (design section 5): DATA of the map, applied to the rows (the validators) and to a live round (module.ts). Pure; no RNG (the generator rolls the ops).
//   ['swap', a, b]    two movable stations trade places
//   ['move', a, b]    the station at a goes to the floor tile b (a becomes floor)
//   ['tile', p, 'i']  a floor tile becomes another letter (ice, a belt, floor, wall, a counter)
export type Pos = readonly [number, number];
export type Op = readonly ['swap', Pos, Pos] | readonly ['move', Pos, Pos] | readonly ['tile', Pos, string];
export interface MutationV2 {
  at: number; // tick of the change (60 per second)
  warn: number; // the banner, the ghosts and the alarm start this many ticks before
  revertAt: number | null; // tick where the inverse is applied, or null: it stays
  ops: readonly Op[];
}

export const MOVABLE = new Set('CH12345KORPEXULMWQ'.split(''));
export const TILE_LETTERS = new Set('.#i→←↑↓C'.split('')); // what a `tile` op may write
export const FLOORISH = new Set('.i→←↑↓'.split('')); // what a `tile` op may overwrite
export const MAX_OPS = 3;

const grid = (rows: readonly string[]) => rows.map((r) => [...r]);
const get = (g: string[][], [x, y]: Pos) => g[y]?.[x];

/** The rows after the ops, applied in list order. Throws nothing: an op that does not fit is skipped (opsProblems says why). */
export function applyRows(rows: readonly string[], ops: readonly Op[]): string[] {
  const g = grid(rows);
  for (const op of ops) {
    const [kind, a, b] = op;
    if (kind === 'tile') {
      if (get(g, a) !== undefined) g[a[1]]![a[0]] = b as string;
    } else if (get(g, a) !== undefined && get(g, b as Pos) !== undefined) {
      const p = b as Pos,
        la = g[a[1]]![a[0]]!,
        lb = g[p[1]]![p[0]]!;
      g[p[1]]![p[0]] = la;
      g[a[1]]![a[0]] = kind === 'swap' ? lb : '.';
    }
  }
  return g.map((r) => r.join(''));
}

/** The inverse list: applied after `ops` it gives the original rows back (move backwards, swap is its own inverse, tile restores the letter it overwrote). */
export function invertOps(rows: readonly string[], ops: readonly Op[]): Op[] {
  const out: Op[] = [];
  let cur = [...rows];
  for (const op of ops) {
    const [kind, a, b] = op;
    if (kind === 'move') out.unshift(['move', b as Pos, a]);
    else if (kind === 'swap') out.unshift(['swap', a, b as Pos]);
    else out.unshift(['tile', a, cur[a[1]]?.[a[0]] ?? '.']);
    cur = applyRows(cur, [op]);
  }
  return out;
}

/** Why a list of ops cannot be applied to these rows ([] = it can). Checked in order, each op against the rows the ones before it left. */
export function opsProblems(rows: readonly string[], m: MutationV2): string[] {
  const out: string[] = [];
  if (m.ops.length > MAX_OPS) out.push(`mutation: ${m.ops.length} ops, at most ${MAX_OPS}`);
  if (!(m.at > 0) || m.warn < 0 || m.warn > m.at) out.push('mutation: at must be positive and warn within it');
  if (m.revertAt !== null && m.revertAt <= m.at) out.push('mutation: revertAt must come after at');
  let cur = [...rows];
  m.ops.forEach((op, i) => {
    const [kind, a, b] = op;
    const here = `op ${i + 1} (${kind})`;
    const at = (p: Pos) => cur[p[1]]?.[p[0]];
    if (at(a) === undefined) return void out.push(`mutation: ${here} starts outside the map`);
    if (kind === 'tile') {
      if (!FLOORISH.has(at(a)!)) out.push(`mutation: ${here} overwrites '${at(a)}' at (${a}): only floor changes`);
      if (!TILE_LETTERS.has(b as string)) out.push(`mutation: ${here} writes '${b}': not a letter a tile op may write`);
    } else {
      const p = b as Pos;
      if (at(p) === undefined) return void out.push(`mutation: ${here} ends outside the map`);
      if (!MOVABLE.has(at(a)!)) out.push(`mutation: ${here} moves '${at(a)}' at (${a}): it cannot move`);
      if (kind === 'move' && at(p) !== '.')
        out.push(`mutation: ${here} lands on '${at(p)}' at (${p}): the destination must be plain floor`);
      if (kind === 'swap' && !MOVABLE.has(at(p)!)) out.push(`mutation: ${here} swaps with '${at(p)}' at (${p}): it cannot move`);
    }
    cur = applyRows(cur, [op]);
  });
  const back = applyRows(applyRows(rows, m.ops), invertOps(rows, m.ops));
  if (back.join('|') !== rows.join('|')) out.push('mutation: the inverse does not give the original map back');
  return out;
}

/** An M needs a pair of opposite floor neighbours (its handles) after the change too. */
export function handleProblems(rows: readonly string[]): string[] {
  const floor = (x: number, y: number) => rows[y]?.[x] !== undefined && !'#~'.includes(rows[y]![x]!) && !MOVABLE.has(rows[y]![x]!);
  return rows.flatMap((r, y) =>
    [...r].flatMap((c, x) =>
      c === 'M' && !(floor(x - 1, y) && floor(x + 1, y)) && !(floor(x, y - 1) && floor(x, y + 1))
        ? [`mutation: the kneader M at (${x}, ${y}) has no pair of free handles`]
        : [],
    ),
  );
}
