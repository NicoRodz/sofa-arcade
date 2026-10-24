// Test support (nothing in the game imports this): scripted chefs that play the sabotage over the public controls of the sim.
//   saboteur: fetches the bag from the bin, loads the catapult, waits a different time before every B (so the reticle lands in different places).
//   janitor:  patrols one lane of the kitchen (and so runs into rubbish now and then), cleans what has been lying around for a while and bins it.
//   cook:     the scripted recipe of golden/bot.ts (it only cooks).
// Like mirror-bot.ts, the chefs of team 1 decide in team 0's frame (position, facing, floor items and stations go through sigma, the stick comes back
// through it), so "the same script on both sides" is exact by construction and any difference in the round comes from the sim.
import { DIRS, isFloor, type Pos } from '../maps';
import { TICK_MS, type Controls, type Game, type Player, type Station } from '../overcooked';
import type { FloorItem } from '../sabotage-config';
import { isoOf, MIRRORS } from './mirror-bot';
import { decide, type Mem as CookMem } from './bot';
import { SIGMAS } from '../symmetry';

export type Role = 'saboteur' | 'janitor' | 'cook' | 'idle';
export interface SabMem { cook: CookMem; throws: number; seenTrashAt: Map<number, number>; pressedAt: number; goal: string }
export const newSabMem = (): SabMem => ({ cook: { step: 0, since: 0, lastPress: -99, bin: false }, throws: 0, seenTrashAt: new Map(), pressedAt: -99, goal: '' });

const snap = (v: number) => Math.round(v * 1e9) / 1e9;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Next tile on the shortest walk from the chef's tile to a tile that satisfies `goal`, avoiding `avoid`. */
function route(g: Game, from: Pos, goal: (x: number, y: number) => boolean, avoid: ReadonlySet<string>): { arrived: boolean; next: Pos | null } {
  if (goal(from[0], from[1])) return { arrived: true, next: null };
  const prev = new Map<string, string | null>([[`${from[0]},${from[1]}`, null]]);
  const queue: Pos[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    if (goal(x, y)) {
      let k = `${x},${y}`;
      while (prev.get(k) && prev.get(prev.get(k)!) !== null) k = prev.get(k)!;
      return { arrived: false, next: k.split(',').map(Number) as Pos };
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (isFloor(g.grid, nx, ny) && !prev.has(k) && !avoid.has(k)) { prev.set(k, `${x},${y}`); queue.push([nx, ny]); }
    }
  }
  return { arrived: false, next: null };
}

interface View { g: Game; me: Player; stations: Station[]; floor: FloorItem[]; time: number; team: number }

/** The decision in team 0's frame. `own` = the chef's team; `bags`/`aim` read from the sim (team-level, frame free). */
function decideSab(v: View, role: Role, mem: SabMem, tickNo: number, rank: number): Controls {
  const { g, me, stations, floor } = v;
  const idle: Controls = { x: 0, y: 0, a: 0, b: false };
  if (role === 'cook') return decide({ grid: g.grid, stations, time: v.time } as unknown as Game, me, rank, mem.cook, tickNo);
  if (role === 'idle' || !g.sab) return idle; // (no sabotage in this round: nothing for a saboteur or a janitor to do)
  const st = g.sab.teams[v.team]!;
  const tile: Pos = [Math.floor(me.x), Math.floor(me.y)];
  const trashTiles = new Set(floor.filter((f) => f.kind === 'trash').map((f) => `${f.tx},${f.ty}`));
  const touches = (s: Station) => (x: number, y: number) => DIRS.some(([dx, dy]) => x + dx === s.tx && y + dy === s.ty);
  const goTo = (goal: (x: number, y: number) => boolean, avoid: ReadonlySet<string> = new Set()) => {
    const r = route(g, tile, goal, avoid);
    if (r.arrived || !r.next) return { arrived: r.arrived, c: idle };
    const dx = r.next[0] + 0.5 - me.x, dy = r.next[1] + 0.5 - me.y, l = Math.hypot(dx, dy) || 1;
    return { arrived: false, c: { x: dx / l, y: dy / l, a: 0, b: false } as Controls };
  };
  const faceAt = (x: number, y: number, mag = 1) => { const dx = x - me.x, dy = y - me.y, l = Math.hypot(dx, dy) || 1; return { x: (dx / l) * mag, y: (dy / l) * mag }; };
  const press = (face: { x: number; y: number }): Controls => {
    if (tickNo - mem.pressedAt < 10) return { ...face, a: 0, b: false };
    mem.pressedAt = tickNo;
    return { ...face, a: 1, b: false };
  };
  const bin = stations.find((s) => s.kind === 'trash')!;
  const cat = stations.find((s) => s.kind === 'catapult')!;

  if (role === 'saboteur') {
    if (st.aim?.player === me.id) { // anchored at the catapult: B after a time that changes from throw to throw
      const wait = 500 + 430 * (mem.throws % 6);
      if (v.time - st.aim.t0 >= wait) { mem.throws++; return { ...idle, b: true }; }
      return idle;
    }
    if (me.item === 'trashBag') {
      const r = goTo(touches(cat));
      if (!r.arrived) return r.c;
      return press(faceAt(cat.tx + 0.5, cat.ty + 0.5));
    }
    if (!me.item && st.bags > 0) {
      const r = goTo(touches(bin));
      if (!r.arrived) return r.c;
      return press(faceAt(bin.tx + 0.5, bin.ty + 0.5));
    }
    if (me.item) { // something else in hand: bin it
      const r = goTo(touches(bin));
      if (!r.arrived) return r.c;
      return press(faceAt(bin.tx + 0.5, bin.ty + 0.5));
    }
    const home = goTo(touches(cat)); // waits at the catapult, out of the way of the others (two chefs pushing each other is the one thing the mirror proof cannot absorb)
    return home.arrived ? idle : home.c;
  }

  // janitor
  for (const f of floor) if (f.kind === 'trash' && !mem.seenTrashAt.has(f.id)) mem.seenTrashAt.set(f.id, v.time);
  if (me.item) {
    const r = goTo(touches(bin), trashTiles);
    if (!r.arrived) return r.c;
    return press(faceAt(bin.tx + 0.5, bin.ty + 0.5));
  }
  const old = floor.filter((f) => f.kind === 'trash' && v.time - (mem.seenTrashAt.get(f.id) ?? v.time) > 4500).sort((a, b) => a.id - b.id)[0]
    ?? floor.filter((f) => f.kind === 'dropped').sort((a, b) => a.id - b.id)[0];
  if (old) {
    const r = goTo((x, y) => Math.abs(x - old.tx) + Math.abs(y - old.ty) === 1, trashTiles);
    if (!r.arrived) return r.c;
    const cx = tile[0] + 0.5, cy = tile[1] + 0.5; // stand on the middle of the tile next to it: the reach is then 1.0, not on the edge of 1.1
    if (dist(me.x, me.y, cx, cy) > 0.1) { const f = faceAt(cx, cy); return { ...f, a: 0, b: false }; }
    return press(faceAt(old.tx + 0.5, old.ty + 0.5, 0.2));
  }
  // patrol: along one lane of the kitchen, end to end (it crosses the places where the bags like to fall), on a row that is not the one where the saboteur waits
  const homeY = DIRS.map(([dx, dy]) => [cat.tx + dx, cat.ty + dy] as Pos).find(([x, y]) => isFloor(g.grid, x, y))![1];
  const lane = homeY === 2 ? 1 : 2;
  if (tile[1] !== lane) { const r = goTo((_x, y) => y === lane, trashTiles); return r.c; }
  const east = Math.sin(tickNo / 140) > 0;
  const wy = lane + 0.5 - me.y;
  return { x: east ? 1 : -1, y: Math.abs(wy) > 0.05 ? Math.sign(wy) * 0.5 : 0, a: 0, b: false };
}

/** What the chef does this tick, as controls in the real world: the frame transform of mirror-bot, then decideSab. */
export function sabotageControls(g: Game, p: Player, role: Role, mem: SabMem, tickNo: number, rank: number, sigmaName: keyof typeof SIGMAS = 'mirrorX'): Controls {
  const iso = isoOf(SIGMAS[sigmaName]);
  const flip = p.team === 1;
  const stations: Station[] = g.stations.filter((s) => s.owner === p.team).map((s) => { const [tx, ty] = flip ? iso.tile(s.tx, s.ty) : [s.tx, s.ty]; return { ...s, tx, ty }; });
  if (flip) stations.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
  const floor: FloorItem[] = g.floor.filter((f) => f.team === p.team).map((f) => { const [tx, ty] = flip ? iso.tile(f.tx, f.ty) : [f.tx, f.ty]; return { ...f, tx, ty }; });
  if (flip) floor.sort((a, b) => a.id - b.id);
  const [x, y] = (flip ? iso.point(p.x, p.y) : [p.x, p.y]).map(snap) as [number, number];
  const [fx, fy] = flip ? iso.vec(p.fx, p.fy) : [p.fx, p.fy];
  const me = { ...p, x, y, fx, fy } as Player;
  const c = decideSab({ g, me, stations, floor, time: g.time, team: p.team }, role, mem, tickNo, rank);
  const [cx, cy] = flip ? iso.vec(c.x, c.y) : [c.x, c.y];
  return { ...c, x: cx, y: cy };
}
export { MIRRORS, TICK_MS, dist };
