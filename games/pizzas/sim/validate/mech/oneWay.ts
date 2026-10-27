// Static validator of 'oneWay' (design section 3, "Vaivén"). Implemented by T1c. A > < ^ v tile can only be entered moving in its sense, so the floor must have no trap: every tile a chef
// can reach from S must have a way back to S, and the stations must stay touchable.
import type { MechValidator } from '../../mech/types';
import { DIRS, STATION_LETTERS, at, cutOff, find, reach } from '../../mech/grid';

const SENSE: Record<string, readonly [number, number]> = { '>': [1, 0], '<': [-1, 0], '^': [0, -1], v: [0, 1] };

export const oneWayValidate: MechValidator = (rows) => {
  if (!rows.some((r) => /[<>^v]/.test(r))) return [];
  const S = find(rows, 'S');
  const enter = (c: string, dx: number, dy: number) => !SENSE[c] || (SENSE[c]![0] === dx && SENSE[c]![1] === dy);
  const forward = reach(rows, S, enter);
  const out = cutOff(rows, forward).map((ch) => `oneWay: nobody reaches the ${ch}`);
  // Walk back: x -> y is an edge when y can be entered from x. Reverse reachability from S: which tiles can still get home?
  const home = new Set<number>(S.map(([x, y]) => y * 16 + x));
  for (let grown = true; grown; ) {
    grown = false;
    for (const i of forward) {
      if (home.has(i)) continue;
      const x = i % 16,
        y = Math.floor(i / 16);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx,
          ny = y + dy,
          c = at(rows, nx, ny);
        if (c !== undefined && home.has(ny * 16 + nx) && !STATION_LETTERS.has(c) && enter(c, dx, dy)) {
          home.add(i);
          grown = true;
          break;
        }
      }
    }
  }
  for (const i of forward) if (!home.has(i)) out.push(`oneWay: trap at (${i % 16}, ${Math.floor(i / 16)}): a chef who gets there cannot come back`);
  return out.slice(0, 6);
};
