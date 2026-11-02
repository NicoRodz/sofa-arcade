// Scripted bot, tests only (never in the product): walks a list of waypoint tiles by the shortest path (BFS), asking for a straight line whenever
// it can. It is the reference of the F0 circuit metric: the stick it sends is always a pure axis at full tilt, like a perfect player.
import { MAP_H, MAP_W, isSolid } from '../map';
import { DOWN, LEFT, NONE, RIGHT, UP, type Dir, type GridBody, type GridInput } from '../sim';

const STEPS: readonly (readonly [Dir, number, number])[] = [
  [RIGHT, 1, 0],
  [DOWN, 0, 1],
  [LEFT, -1, 0],
  [UP, 0, -1],
];
const SPAN = 16;

/** Steps to the target from every tile (-1 for furniture or unreachable). */
export function distanceField(tx: number, ty: number): Int16Array {
  const d = new Int16Array(MAP_W * MAP_H).fill(-1);
  d[ty * MAP_W + tx] = 0;
  const q = [[tx, ty]] as [number, number][];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [, dx, dy] of STEPS) {
      const nx = x + dx,
        ny = y + dy;
      if (isSolid(nx, ny) || d[ny * MAP_W + nx] !== -1) continue;
      d[ny * MAP_W + nx] = d[y * MAP_W + x]! + 1;
      q.push([nx, ny]);
    }
  }
  return d;
}

export class RouteBot {
  next = 0; // index of the waypoint being chased
  private fields: Int16Array[];

  constructor(private waypoints: readonly (readonly [number, number])[]) {
    this.fields = waypoints.map(([x, y]) => distanceField(x, y));
  }

  get done(): boolean {
    return this.next >= this.waypoints.length;
  }

  input(b: GridBody): GridInput {
    const tx = Math.floor(b.x / SPAN),
      ty = Math.floor(b.y / SPAN);
    while (!this.done && this.waypoints[this.next]![0] === tx && this.waypoints[this.next]![1] === ty) this.next++;
    if (this.done) return { sx: 0, sy: 0 };
    const d = this.fields[this.next]!;
    const here = d[ty * MAP_W + tx]!;
    let pick: Dir = NONE;
    for (const [dir, dx, dy] of STEPS) {
      const nx = tx + dx,
        ny = ty + dy;
      if (isSolid(nx, ny) || d[ny * MAP_W + nx] !== here - 1) continue;
      if (pick === NONE || dir === b.dir) pick = dir; // prefer to keep the heading
    }
    const [, dx, dy] = STEPS[pick === NONE ? 0 : pick]!;
    return pick === NONE ? { sx: 0, sy: 0 } : { sx: dx * 1000, sy: dy * 1000 };
  }

  /** Length in tiles of the whole route from a start tile. */
  routeTiles(from: readonly [number, number]): number {
    let [x, y] = from;
    let total = 0;
    for (let i = 0; i < this.waypoints.length; i++) {
      total += this.fields[i]![y * MAP_W + x]!;
      [x, y] = this.waypoints[i]!;
    }
    return total;
  }
}
