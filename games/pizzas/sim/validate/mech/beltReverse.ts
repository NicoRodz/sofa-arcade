// Static validator of 'beltReverse'. Implemented by T1b. The belts turn round every 1800 ticks, so the map has to work in both senses: a floor belt only pushes (a chef out-walks it at 3.3 t/s),
// so the real risks are a map that says it has reversible belts and has none, a belt out of the chefs' reach, and a belt whose end is water (a loose item would be carried into the river).
import type { MechValidator } from '../../mech/types';

const BELTS = '→←↑↓';
const SOLID = new Set(['#', '~']);
const AXIS: Record<string, readonly [number, number]> = { '→': [1, 0], '←': [1, 0], '↑': [0, 1], '↓': [0, 1] };

export const beltReverseValidate: MechValidator = (rows) => {
  if (!rows.length) return [];
  const out: string[] = [];
  const belts = rows.flatMap((r, y) => [...r].flatMap((c, x) => (BELTS.includes(c) ? [{ x, y, c }] : [])));
  if (!belts.length) return ['beltReverse: the map has no belt (→ ← ↑ ↓) to reverse'];
  const floor = new Set<number>();
  const q: [number, number][] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => c === 'S' && (floor.add(y * 16 + x), q.push([x, y]))));
  for (let i = 0; i < q.length; i++)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = q[i]![0] + dx, ny = q[i]![1] + dy, c = rows[ny]?.[nx];
      if (c === undefined || floor.has(ny * 16 + nx) || SOLID.has(c) || /[0-9A-Z]/.test(c)) continue;
      floor.add(ny * 16 + nx);
      q.push([nx, ny]);
    }
  for (const b of belts) {
    if (!floor.has(b.y * 16 + b.x)) out.push(`beltReverse: belt at (${b.x}, ${b.y}) is out of reach from the spawns`);
    const [ax, ay] = AXIS[b.c]!;
    for (const s of [1, -1]) if (rows[b.y + ay * s]?.[b.x + ax * s] === '~') out.push(`beltReverse: belt at (${b.x}, ${b.y}) points into water when it reverses`);
  }
  return out;
};
