// Test support: the BFS the scripted bots use to walk, on flat arrays instead of string-keyed Maps (it was the hottest function of test:slow).
// It visits tiles in the same order as the Map version (same DIRS order, same queue), so the first step it returns is the same one.
import { DIRS, type Grid } from '../../sim/maps';

const DX = DIRS.map((d) => d[0]);
const DY = DIRS.map((d) => d[1]);
// Scratch buffers shared by every call (the BFS never re-enters): a call only clears the tiles it marked.
let seen = new Uint8Array(0);
let first = new Int32Array(0); // per tile: the first step of the walk that reached it
let queue = new Int32Array(0); // flat tile index: y * w + x

/** First tile of the shortest floor walk from (sx, sy) to a tile that satisfies `goal` (the start excluded), or null when none does. The start must be on the grid (a chef always is). */
export function firstStep(grid: Grid, sx: number, sy: number, goal: (x: number, y: number) => boolean): [number, number] | null {
  const h = grid.length;
  let w = 0;
  for (const row of grid) w = Math.max(w, row.length);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) throw new Error(`firstStep: start (${sx}, ${sy}) is off the ${w}x${h} grid`);
  if (seen.length < w * h) {
    seen = new Uint8Array(w * h);
    first = new Int32Array(w * h);
    queue = new Int32Array(w * h);
  }
  const seen_ = seen;
  const first_ = first;
  const queue_ = queue;
  let tail = 1;
  queue_[0] = sy * w + sx;
  seen_[queue_[0]] = 1;
  let result: [number, number] | null = null;
  for (let head = 0; head < tail; head++) {
    const cur = queue_[head]!;
    const x = cur % w;
    const y = (cur - x) / w;
    if (goal(x, y)) {
      if (head > 0) result = [first_[cur]! % w, Math.floor(first_[cur]! / w)];
      break;
    }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const k = ny * w + nx;
      if (seen_[k] || grid[ny]![nx]?.kind !== 'floor') continue;
      seen_[k] = 1;
      first_[k] = head === 0 ? k : first_[cur]!;
      queue_[tail++] = k;
    }
  }
  for (let i = 0; i < tail; i++) seen_[queue_[i]!] = 0;
  return result;
}
