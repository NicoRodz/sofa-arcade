// Plans that leave a segment (on foot, tower, hand catch zones): the starting points the explorer simulates.
import { JUMP_V0, PLAYER_H, PLAYER_W, TILE, TRAMPOLINE_MULT } from '../../constants';
import { T } from '../../legend';
import { boxHitsSolid, tileAt, tileOf, type TileGrid } from '../../sim/world/tiles';
import { feetOfRow, type CatchZone, type Plan } from '../sim';
import type { Seg } from './types';

const HAND_FACE_PX = 20;

const startXs = (s: Seg): number[] => {
  const lo = s.x0 * TILE - 17,
    hi = (s.x1 + 1) * TILE - 17;
  const xs = new Set<number>([lo, hi, s.x0 * TILE, (s.x1 + 1) * TILE - PLAYER_W]); // the flush spots matter when a hazard hugs the end
  const cells = s.x1 - s.x0 + 1;
  const n = Math.min(6, cells + 1);
  for (let i = 1; i < n; i++) xs.add(Math.round(lo + ((hi - lo) * i) / n));
  return [...xs].sort((a, b) => a - b);
};

// Plans that leave a segment on foot: walk off, run and jump at the edge, jump from a spot, drop through a one-way.
export function planSet(g: TileGrid, s: Seg, f: number): Plan[] {
  const out: Plan[] = [];
  const feetY = feetOfRow(s.row);
  if (s.tramp) {
    // the boya throws whoever lands on it at 1.45 * v0, steering with the stick
    for (const x of startXs(s))
      for (const dir of [-1, 0, 1] as const)
        for (const air of dir === 0 ? ['hold' as const] : ['hold' as const, 'brake' as const])
          out.push({ x, feetY, dir, trigger: 'launch', k: 0, air, f, vx0: dir * 330 * f * 0.5, vy0: -JUMP_V0 * TRAMPOLINE_MULT });
    return out;
  }
  const base = { feetY, f, k: 0 as number, air: 'hold' as const };
  const ends: { dir: -1 | 1; x: number }[] = [
    { dir: 1, x: Math.max(s.x0 * TILE - 17, (s.x1 + 1) * TILE - TILE) },
    { dir: -1, x: Math.min((s.x1 + 1) * TILE - 17, s.x0 * TILE + TILE - PLAYER_W) },
  ];
  for (const e of ends) {
    out.push({ ...base, x: e.x, dir: e.dir, trigger: 'walk' });
    for (const k of [0, 3])
      for (const air of ['hold', 'brake'] as const) out.push({ ...base, x: e.x, dir: e.dir, trigger: 'edge', k, air });
    const endX = e.dir === 1 ? (s.x1 + 1) * TILE : s.x0 * TILE;
    const runStart = Math.max(
      s.x0 * TILE - 17,
      Math.min((s.x1 + 1) * TILE - 17, e.dir === 1 ? endX - 5 * TILE : endX + 5 * TILE - PLAYER_W),
    );
    for (const lead of [16, 32, 56, 80])
      for (const air of ['hold', 'brake'] as const) out.push({ ...base, x: runStart, dir: e.dir, trigger: 'edge', k: 0, lead, endX, air }); // a run-up that jumps early (hazards hugging the end)
  }
  for (const x of startXs(s)) {
    out.push({ ...base, x, dir: 0, trigger: 'at' });
    for (const dir of [-1, 1] as const) for (const air of ['hold', 'brake'] as const) out.push({ ...base, x, dir, trigger: 'at', air });
  }
  const onOneWay = tileAt(g, s.x0, s.row + 1) === T.OneWay || tileAt(g, s.x1, s.row + 1) === T.OneWay;
  if (onOneWay) for (const x of startXs(s)) for (const dir of [-1, 0, 1] as const) out.push({ ...base, x, dir, trigger: 'drop' });
  return out;
}

// Towers of k stacked bases (plan §12: +46 px per base, needs n >= k + 1): the climber starts on the bases' heads hugging a wall.
export function towerPlans(g: TileGrid, s: Seg, f: number, maxK: number): { plan: Plan; k: number }[] {
  const out: { plan: Plan; k: number }[] = [];
  for (let k = 1; k <= maxK; k++) {
    const ends: { dir: -1 | 1; x: number }[] = [
      { dir: 1, x: (s.x1 + 1) * TILE - PLAYER_W },
      { dir: -1, x: s.x0 * TILE },
    ];
    for (const e of ends) {
      const feetY = feetOfRow(s.row) - PLAYER_H * k;
      if (boxHitsSolid(g, e.x, feetY - PLAYER_H, PLAYER_W, PLAYER_H * (k + 1))) continue;
      out.push({ k, plan: { x: e.x, feetY, dir: e.dir, trigger: 'at', k: 0, air: 'hold', f } });
    }
  }
  return out;
}

export function catchZonesFor(g: TileGrid, segs: Seg[], keep: (id: number) => boolean, handZoneTiles: number): Map<number, CatchZone[]> {
  const map = new Map<number, CatchZone[]>();
  const add = (tx: number, z: CatchZone) => {
    const l = map.get(tx) ?? [];
    l.push(z);
    map.set(tx, l);
  };
  for (const s of segs) {
    if (!keep(s.id)) continue;
    const top = (s.row + 1) * TILE,
      zone = handZoneTiles * TILE;
    // left end: the face is x = x0 * TILE, the catcher reaches to the left; right end mirrors it
    const left: CatchZone = {
      x0: s.x0 * TILE - HAND_FACE_PX - PLAYER_W + 8,
      x1: s.x0 * TILE + 6,
      yTop: top + 2,
      yBot: top + zone,
      cx: s.x0,
      ty: s.row,
    };
    const right: CatchZone = {
      x0: (s.x1 + 1) * TILE - 6,
      x1: (s.x1 + 1) * TILE + HAND_FACE_PX + PLAYER_W - 8,
      yTop: top + 2,
      yBot: top + zone,
      cx: s.x1,
      ty: s.row,
    };
    for (const z of [left, right]) {
      const tx0 = tileOf(z.x0),
        tx1 = tileOf(z.x1);
      for (let tx = tx0; tx <= tx1; tx++) add(tx, z);
    }
  }
  return map;
}
