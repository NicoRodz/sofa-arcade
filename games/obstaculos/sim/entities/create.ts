// createEntities (parse the level's dynamic things into World.ent) and the extra platforms they make.
import { TILE } from '../../constants';
import { T } from '../../legend';
import type { ParsedLevel } from '../../parse';
import type { Cell } from '../../types';
import type { PxRect } from '../collide';
import type { Platform } from '../player';
import type { BoxE, Entities, HazardE, KeyE, Objective, PickE, World } from '../state';
import type { CampaignParams } from '../campaign';
import { createEnemies } from '../enemies';
import { AVALANCHE_START_TILES, BOX_ID0, BOX_SIZE, BALANCE_ID0, MOVER_ID0, SINKER_ID0 } from '../tuning';
import { setTile, type TileGrid } from '../tiles';

export const idx = (x: number, y: number, w: number) => y * w + x;

export function createEntities(p: ParsedLevel, grid: TileGrid, hazardMult: number, camp: CampaignParams | null = null): Entities {
  const ent: Entities = {
    activators: [],
    objectives: [],
    boxes: [],
    keys: [],
    crumbles: [],
    rings: [...p.markers.ring, ...p.markers.bungee],
    checkpoints: p.markers.checkpoint.map((cell) => ({ cell, activated: false })),
    stars: p.markers.star.map((cell) => ({ cell, taken: false })),
    enemies: camp ? createEnemies(p, camp) : [],
    pickaxes: [],
    lanterns: [],
    crystals: [],
    bungeeFrom: p.markers.ring.length,
    doorCells: new Set(),
    hazard: null,
    lastStarTick: -Infinity,
    streak: 0,
  };
  if (camp)
    ent.pickaxes = p.markers.pickaxe.map((c): PickE => {
      const x = c.x * TILE + TILE / 2,
        y = c.y * TILE + TILE / 2;
      return { x, y, homeX: x, homeY: y, heldBy: -1 };
    });
  if (camp)
    ent.lanterns = p.markers.lantern.map((c): PickE => {
      const x = c.x * TILE + TILE / 2,
        y = c.y * TILE + TILE / 2;
      return { x, y, homeX: x, homeY: y, heldBy: -1 };
    });
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const k = grid.cells[idx(x, y, p.w)];
      if (k === T.Crystal) {
        if (camp) ent.crystals.push({ x, y });
        else grid.cells[idx(x, y, p.w)] = T.Empty;
      } // a crystal outside a campaign is just air (nothing lights it)
      if (k === T.Door) ent.doorCells.add(idx(x, y, p.w));
      if (k === T.Crumble) ent.crumbles.push({ x, y, state: 0, t: 0 });
    }
  const letters = Object.keys(p.objects).sort();
  for (const ch of letters) {
    const o = p.objects[ch]!;
    const param = o.param;
    if (!param) continue;
    const rect = { x: o.bounds.x * TILE, y: o.bounds.y * TILE, w: o.bounds.w * TILE, h: o.bounds.h * TILE };
    if (param.kind === 'plate' || param.kind === 'lever' || param.kind === 'target') {
      ent.activators.push({
        letter: ch,
        kind: param.kind,
        rect,
        opens: param.opens,
        latch: param.kind === 'target' ? false : param.latch,
        weight: param.kind === 'plate' ? param.weight : 1,
        required: 1,
        load: 0,
        pressed: false,
        latched: false,
        holders: [],
        timer: 0,
      });
    } else {
      ent.objectives.push({
        letter: ch,
        kind: param.kind,
        param,
        cells: o.cells,
        rect,
        hasOpener: false,
        open: false,
        platformId: -1,
        phase: 0,
        ox: 0,
        oy: 0,
        dx: 0,
        dy: 0,
        load: 0,
        moving: false,
      });
    }
  }
  let m = 0,
    b = 0,
    sk = 0;
  for (const ob of ent.objectives) {
    ob.hasOpener = ent.activators.some((a) => a.opens === ob.letter);
    if (ob.kind === 'mover') ob.platformId = MOVER_ID0 + m++;
    if (ob.kind === 'balance') ob.platformId = BALANCE_ID0 + b++;
    if (ob.kind === 'sinker') ob.platformId = SINKER_ID0 + sk++;
    ob.open = ob.kind === 'gate' ? false : ob.kind === 'ladder' ? !ob.hasOpener : ob.kind === 'mover' ? !ob.hasOpener : true;
    if (ob.kind === 'gate') for (const c of ob.cells) setTile(grid, c.x, c.y, T.Door);
    if (ob.kind === 'ladder') for (const c of ob.cells) setTile(grid, c.x, c.y, ob.open ? T.Ladder : T.Object);
  }
  const mkBox = (c: Cell, heavy: boolean, i: number): BoxE => {
    const x = c.x * TILE + (TILE - BOX_SIZE) / 2,
      y = (c.y + 1) * TILE - BOX_SIZE;
    return { id: BOX_ID0 + i, heavy, x, y, vy: 0, homeX: x, homeY: y, holders: [], dx: 0, dy: 0, grounded: false };
  };
  p.markers.box.forEach((c, i) => ent.boxes.push(mkBox(c, false, i)));
  p.markers.heavyBox.forEach((c, i) => ent.boxes.push(mkBox(c, true, p.markers.box.length + i)));
  ent.keys = p.markers.key.map(
    (c): KeyE => ({
      x: c.x * TILE + TILE / 2,
      y: c.y * TILE + TILE / 2,
      homeX: c.x * TILE + TILE / 2,
      homeY: c.y * TILE + TILE / 2,
      heldBy: -1,
      used: false,
    }),
  );
  const hz = p.def.hazard;
  if (hz) {
    const pos = hz.kind === 'avalanche' ? -AVALANCHE_START_TILES * TILE : p.h * TILE;
    ent.hazard = { kind: hz.kind, speed: hz.speed * hazardMult, pos, frozen: 0, phase: 0 } satisfies HazardE;
  }
  return ent;
}

export const boxPlatform = (b: BoxE): Platform => ({
  id: b.id,
  x: b.x,
  y: b.y,
  w: BOX_SIZE,
  h: BOX_SIZE,
  oneWay: true,
  dx: b.dx,
  dy: b.dy,
});
export const objRect = (o: Objective): PxRect => ({ x: o.rect.x + o.ox, y: o.rect.y + o.oy, w: o.rect.w, h: o.rect.h });

// Surfaces that are not tiles and not heads: free boxes, movers, balance plates (all one-way: you stand on them from above).
export function extraPlatforms(w: World): Platform[] {
  const out: Platform[] = [];
  for (const b of w.ent.boxes) if (b.holders.length === 0) out.push(boxPlatform(b));
  for (const o of w.ent.objectives) {
    if (o.kind !== 'mover' && o.kind !== 'balance' && o.kind !== 'sinker') continue;
    const r = objRect(o);
    out.push({ id: o.platformId, x: r.x, y: r.y, w: r.w, h: r.h, oneWay: true, dx: o.dx, dy: o.dy });
  }
  return out;
}
