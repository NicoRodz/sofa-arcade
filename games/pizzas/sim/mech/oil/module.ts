// Oil, fire and the extinguisher on the floor (design section 3, "Aceite" and "Fuego"). Implemented by T1d.
//  - Oil `a` (a puddle at the start, it never dries) and the drips `g` (every 720 ticks one neighbour, in the fixed order N-E-S-O). A ready sauce pot nobody empties oils its four neighbours after 480.
//  - A chef on oil keeps the ice friction (ICE_TAU_MS); on water, half of it. The Derrame event (spill.ts) throws patches that dry after 1800.
//  - Fire: an oven on fire lights the oil next to it; it hops oil to oil every 45 ticks (tile order), never under a chef; a burning tile is a wall for 360 and then clean. A chef who holds B in front of a
//    fire (180 ticks) or an oil tile (60) puts it out / wipes it: it is the extinguisher, with the same verb as the ovens. Two chefs add up.
import type { MechModule } from '../types';
import type { OilExt } from './state';
import { noopHooks } from '../noop';
import { oilValidate } from '../../validate/mech/oil';
import { oilStamp } from '../../gen/stamps/oil';
import { ICE_TAU_MS } from '../../surfaces/config';
import { emitMech } from '../kneader/call';
import { hz3Params } from '../../hazards/hazard-v3';
import { book } from '../../hazards/score-ledger';
import { addFloorItem } from '../../floor';
import type { Game, Player } from '../../round/state';
import {
  ageTiles,
  FIRE,
  FIRE_JUMP,
  FIRE_TICKS,
  NESW,
  OIL,
  OIL_TICKS,
  SAUCE_WAIT,
  TILES,
  WATER,
  WIPE_FIRE,
  at,
  ext,
  freeFloor,
  setTile,
  tileIdx,
} from './state';

/** The tile in front of a chef (the dominant axis of where it faces), or -1. */
export function frontOf(p: Player): number {
  const horizontal = Math.abs(p.fx) >= Math.abs(p.fy);
  return tileIdx(Math.floor(p.x) + (horizontal ? Math.sign(p.fx) : 0), Math.floor(p.y) + (horizontal ? 0 : Math.sign(p.fy)));
}
export function oilOn(g: Game, idx: number, ticks: number) {
  if (freeFloor(g, idx) && at(g, idx) === 0) setTile(g, idx, OIL, ticks);
}
function light(g: Game, idx: number) {
  if (idx >= 0 && at(g, idx) === OIL && freeFloor(g, idx)) {
    setTile(g, idx, FIRE, FIRE_TICKS);
    emitMech(g, 'mech:fire', { tile: idx });
  }
}

/** Ticks of chef-B an oil tile needs: HAZARD_V3 raises it to 1.5 s alone; every chef adds one per tick, so two chefs take 0.75 s. */
const wipeNeed = (g: Game): number => hz3Params(g).oil.wipeTicks;
/** HAZARD_V3, Hard: a chef that steps onto oil with something in its hands drops it (at most one drop per `lossGapMs`). The oil is on the floor, visible, and a wipe of 1.5 s clears it. */
function dropOnOil(g: Game, e: OilExt) {
  const hz = hz3Params(g);
  if (!hz.oil.dropOnSlip) return;
  const now: Record<number, number> = {};
  for (const p of [...g.players.values()].sort((a, b) => a.id - b.id)) {
    if (p.ghost) continue;
    const idx = Math.floor(p.y) * 16 + Math.floor(p.x);
    now[p.id] = idx;
    if (e.on[p.id] === idx || at(g, idx) !== OIL || !p.item || p.item === 'trashBag') continue;
    if (g.time - (e.lastDropAt ?? -Infinity) < hz.lossGapMs) continue;
    e.lastDropAt = g.time;
    addFloorItem(g, { tx: Math.floor(p.x), ty: Math.floor(p.y), item: p.item, kind: 'dropped', team: p.team });
    book(g, 'hazard:oil-drop', 0);
    p.item = null;
  }
  e.on = now;
}

export const oilModule: MechModule = {
  ...noopHooks,
  id: 'oil',
  tanda: 'T1d',
  validate: oilValidate,
  stamp: oilStamp,
  onLoad(g) {
    g.mech!.tile = new Uint8Array(TILES);
    g.mech!.tileT = new Uint16Array(TILES);
    const drops: number[] = [];
    g.grid.forEach((row, y) =>
      row.forEach((t, x) => {
        if (t.kind !== 'floor') return;
        if (t.mech === 'a')
          setTile(g, y * 16 + x, OIL, 0); // 0 = it never dries
        else if (t.mech === 'g') drops.push(y * 16 + x);
      }),
    );
    g.mech!.ext = { ...g.mech!.ext, oil: { tick: 0, drops, drips: {}, sauce: {}, spilt: {}, work: {}, hot: {}, on: {} } };
  },
  friction(g, tx, ty, tauMs) {
    const k = at(g, ty * 16 + tx);
    return k === OIL ? Math.max(tauMs, ICE_TAU_MS) : k === WATER ? Math.max(tauMs, ICE_TAU_MS / 2) : tauMs;
  },
  canEnter: (g, tx, ty) => at(g, ty * 16 + tx) !== FIRE,
  claimsB(g, p, target) {
    if (target) return false;
    const k = at(g, frontOf(p));
    return k === OIL || k === FIRE;
  },
  onInteract(g, p, c, target) {
    if (!c.b || target) return false;
    const idx = frontOf(p),
      k = at(g, idx);
    if (k !== OIL && k !== FIRE) return false;
    const e = ext(g);
    e.work[idx] = (e.work[idx] ?? 0) + 1;
    e.hot[idx] = true;
    return false;
  },
  tickStations(g) {
    const e = ext(g);
    for (const [i, s] of g.stations.entries()) {
      if (s.kind !== 'saucepot') continue;
      if (!s.done) {
        e.sauce[i] = 0;
        e.spilt[i] = false;
      } else if (!e.spilt[i] && (e.sauce[i] = (e.sauce[i] ?? 0) + 1) >= SAUCE_WAIT) {
        e.spilt[i] = true;
        for (const [dx, dy] of NESW) oilOn(g, tileIdx(s.tx + dx, s.ty + dy), OIL_TICKS);
      }
    }
  },
  tickTiles(g) {
    const e = ext(g),
      tile = g.mech!.tile!,
      left = g.mech!.tileT!;
    e.tick++;
    for (const [k, n] of Object.entries(e.work)) {
      const idx = Number(k);
      if (!e.hot[idx])
        delete e.work[idx]; // the wiping is a run: nobody held B on it this tick, it starts again
      else if (n >= (at(g, idx) === FIRE ? WIPE_FIRE : wipeNeed(g))) {
        setTile(g, idx, 0, 0);
        delete e.work[idx];
        emitMech(g, 'mech:wiped', { tile: idx });
      }
    }
    e.hot = {};
    dropOnOil(g, e);
    if (e.tick % hz3Params(g).oil.dripEvery === 0)
      for (const d of e.drops) {
        const n = (e.drips[d] = (e.drips[d] ?? -1) + 1);
        for (let i = 0; i < 4; i++) {
          const [dx, dy] = NESW[(n + i) % 4]!;
          const to = tileIdx((d % 16) + dx, Math.floor(d / 16) + dy);
          if (freeFloor(g, to) && at(g, to) === 0) {
            setTile(g, to, OIL, OIL_TICKS);
            break;
          }
        }
      }
    if (e.tick % FIRE_JUMP === 0) {
      const burning = [...tile.keys()].filter((i) => tile[i] === FIRE); // snapshot: one hop per jump
      for (const i of burning) for (const [dx, dy] of NESW) light(g, tileIdx((i % 16) + dx, Math.floor(i / 16) + dy));
    }
    ageTiles(g);
    for (let i = g.floor.length - 1; i >= 0; i--) if (at(g, g.floor[i]!.ty * 16 + g.floor[i]!.tx) === FIRE) g.floor.splice(i, 1); // the fire burns what lies loose
  },
  onFire(g, s, phase) {
    if (phase === 'out') {
      for (const [dx, dy] of NESW) {
        const idx = tileIdx(s.tx + dx, s.ty + dy);
        if (idx >= 0 && (at(g, idx) === OIL || at(g, idx) === FIRE)) setTile(g, idx, 0, 0); // the extinguisher also cleans the oil in front
      }
      return;
    }
    for (const [dx, dy] of NESW) light(g, tileIdx(s.tx + dx, s.ty + dy));
  },
  hashExtra(g) {
    const e = ext(g),
      tile = g.mech!.tile!,
      left = g.mech!.tileT!;
    const out: number[] = [e.tick];
    for (let i = 0; i < TILES; i++) if (tile[i]) out.push(i, tile[i]!, left[i]!);
    for (const [k, v] of Object.entries(e.drips)) out.push(Number(k), v);
    for (const [k, v] of Object.entries(e.sauce)) out.push(Number(k), v, e.spilt[Number(k)] ? 1 : 0);
    return out;
  },
};
