// The floor tiles whose loss splits the floor into more regions (the C of the difficulty metric).
// Removing a tile leaves `count - 1 + k` regions when its own region falls into k pieces (k = 0 for a lone tile), so it is a chokepoint
// exactly when k >= 2: an articulation point of the floor graph. One Tarjan pass replaces a flood fill per floor tile.
import { DIRS, isFloor, posKey, type Grid } from '../maps';

export function chokepoints(g: Grid): Set<string> {
  const h = g.length;
  const w = g.reduce((m, row) => Math.max(m, row.length), 0);
  const disc = new Int32Array(w * h).fill(-1);
  const low = new Int32Array(w * h);
  const out = new Set<string>();
  let clock = 0;
  const visit = (x: number, y: number, parent: number): void => {
    const u = y * w + x;
    disc[u] = low[u] = clock++;
    let children = 0;
    let cuts = false;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (!isFloor(g, nx, ny)) continue;
      const v = ny * w + nx;
      if (v === parent) continue;
      if (disc[v]! >= 0) low[u] = Math.min(low[u]!, disc[v]!);
      else {
        children++;
        visit(nx, ny, u);
        low[u] = Math.min(low[u]!, low[v]!);
        if (parent >= 0 && low[v]! >= disc[u]!) cuts = true;
      }
    }
    if (cuts || (parent < 0 && children > 1)) out.add(posKey(x, y));
  };
  g.forEach((row, y) =>
    row.forEach((_t, x) => {
      if (isFloor(g, x, y) && disc[y * w + x]! < 0) visit(x, y, -1);
    }),
  );
  return out;
}
