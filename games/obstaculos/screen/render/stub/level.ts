// Level helpers of the stand-in world: the rope groups (cordadas) and the entities a parsed level starts with.
import { TILE, type ParsedLevel } from '../../../index';
import type { EntityView } from '../view';

export function cordadas(n: number, max = 4): number[][] {
  const sizes = n <= max ? [n] : n === 5 ? [3, 2] : n === 6 ? [3, 3] : n === 7 ? [4, 3] : [4, 4];
  let k = 0;
  return sizes.map((s) => Array.from({ length: s }, () => k++));
}

// Static entities every level has: stars, checkpoints, goal, rings, boxes, keys, and objects from params (plates, gates...).
export function entitiesFromLevel(p: ParsedLevel): EntityView[] {
  const out: EntityView[] = [];
  const e = (id: string, kind: EntityView['kind'], x: number, y: number, w = TILE, h = TILE, tag = '', label = ''): void => {
    out.push({ id, kind, x, y, w, h, tag, on: false, value: 0, label, holder: -1 });
  };
  p.markers.star.forEach((c, i) => e(`star${i}`, 'star', c.x * TILE, c.y * TILE));
  p.markers.checkpoint.forEach((c, i) => e(`cp${i}`, 'checkpoint', c.x * TILE, c.y * TILE));
  p.markers.goal.forEach((c, i) => e(`goal${i}`, 'goal', c.x * TILE, c.y * TILE));
  p.markers.ring.forEach((c, i) => e(`ring${i}`, 'ring', c.x * TILE, c.y * TILE));
  p.markers.box.forEach((c, i) => e(`box${i}`, 'box', c.x * TILE, c.y * TILE));
  p.markers.heavyBox.forEach((c, i) => e(`hbox${i}`, 'heavyBox', c.x * TILE, c.y * TILE, TILE, TILE, '', '2'));
  p.markers.key.forEach((c, i) => e(`key${i}`, 'key', c.x * TILE, c.y * TILE));
  p.markers.pickaxe.forEach((c, i) => e(`pick${i}`, 'pickaxe', c.x * TILE, c.y * TILE));
  p.markers.lantern.forEach((c, i) => e(`lantern${i}`, 'lantern', c.x * TILE, c.y * TILE));
  p.markers.bungee.forEach((c, i) => e(`ring${p.markers.ring.length + i}`, 'ring', c.x * TILE, c.y * TILE, TILE, TILE, '', 'elastic')); // the elastic rings follow the plain ones (the sim's ring order)
  for (const o of Object.values(p.objects)) {
    const b = o.bounds,
      prm = o.param;
    if (!prm) continue;
    const kind =
      prm.kind === 'plate'
        ? 'plate'
        : prm.kind === 'lever'
          ? 'lever'
          : prm.kind === 'target'
            ? 'target'
            : prm.kind === 'gate'
              ? 'gate'
              : prm.kind === 'ladder'
                ? 'ladder'
                : prm.kind === 'mover'
                  ? 'mover'
                  : prm.kind === 'sinker'
                    ? 'sinker'
                    : prm.kind === 'geyser'
                      ? 'geyser'
                      : 'balance';
    const label =
      prm.kind === 'plate'
        ? typeof prm.weight === 'number'
          ? String(prm.weight)
          : prm.weight === 'half-up'
            ? '½↑'
            : prm.weight === 'half-down'
              ? '½↓'
              : prm.weight === 'all'
                ? 'todos'
                : 'n-1'
        : '';
    e(`obj${o.char}`, kind, b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE, o.char, label);
  }
  return out;
}
