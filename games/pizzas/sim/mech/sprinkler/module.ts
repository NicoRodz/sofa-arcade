// Sprinkler `*` (design section 3, "Aspersor"): a walkable tile that, every 1200 ticks or as soon as there is fire within radius 2, wets the 3x3 around it for 120 ticks: it puts the fire out, washes the
// oil off and leaves water (half the ice friction) for 300. A W oven inside the 3x3 loses its fuel (the validator keeps the sprinkler 2 tiles away from every W). Implemented by T1d.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { sprinklerValidate } from '../../validate/mech/sprinkler';
import { sprinklerStamp } from '../../gen/stamps/sprinkler';
import { ageTiles, FIRE, WATER, WATER_TICKS, at, setTile, tileIdx } from '../oil/state';
import { ICE_TAU_MS } from '../../surfaces/config';
import type { Game } from '../../round/state';
import { emitMech } from '../kneader/call';

export const SPRAY_EVERY = 1200;
export const SPRAY_TICKS = 120;
export const SPRAY_COOLDOWN = 300;

interface Head {
  at: number;
  next: number; // tick of the next periodic burst
  on: number; // ticks of the burst left
  cool: number; // tick before which a fire does not trigger it again
}
interface Ext {
  tick: number;
  heads: Head[];
}
const ext = (g: Game) => g.mech!.ext!.sprinkler as Ext;
export const heads = (g: Game): readonly Head[] => ext(g).heads;

/** Is there fire (a burning tile, or a station on fire) within `r` tiles (Chebyshev) of a tile? */
function fireNear(g: Game, idx: number, r: number): boolean {
  const x = idx % 16,
    y = Math.floor(idx / 16);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const i = tileIdx(x + dx, y + dy);
      if (i >= 0 && g.mech!.tile && at(g, i) === FIRE) return true;
    }
  return g.stations.some((s) => s.fire !== undefined && Math.abs(s.tx - x) <= r && Math.abs(s.ty - y) <= r);
}

export const sprinklerModule: MechModule = {
  ...noopHooks,
  id: 'sprinkler',
  tanda: 'T1d',
  validate: sprinklerValidate,
  stamp: sprinklerStamp,
  onLoad(g) {
    const hs: Head[] = [];
    g.grid.forEach((row, y) =>
      row.forEach((t, x) => t.kind === 'floor' && t.mech === '*' && hs.push({ at: y * 16 + x, next: SPRAY_EVERY, on: 0, cool: 0 })),
    );
    g.mech!.ext = { ...g.mech!.ext, sprinkler: { tick: 0, heads: hs } satisfies Ext };
    g.mech!.tile ??= new Uint8Array(16 * 9); // the oil module makes them; a map with only a sprinkler still needs the water layer
    g.mech!.tileT ??= new Uint16Array(16 * 9);
  },
  friction: (g, tx, ty, tauMs) => (!g.flags!.mech.oil && at(g, ty * 16 + tx) === WATER ? Math.max(tauMs, ICE_TAU_MS / 2) : tauMs), // the oil module owns it when it is on
  tickTiles(g) {
    const e = ext(g);
    e.tick++;
    for (const h of e.heads) {
      if (!h.on && (e.tick >= h.next || (e.tick >= h.cool && fireNear(g, h.at, 2)))) {
        h.on = SPRAY_TICKS;
        h.next = e.tick + SPRAY_EVERY;
        h.cool = e.tick + SPRAY_TICKS + SPRAY_COOLDOWN;
        emitMech(g, 'mech:spray', { tile: h.at });
      }
      if (!h.on) continue;
      h.on--;
      const x = h.at % 16,
        y = Math.floor(h.at / 16);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const i = tileIdx(x + dx, y + dy);
          const t = g.grid[y + dy]?.[x + dx];
          if (i < 0 || !t) continue;
          if (t.kind === 'floor' && (!t.mech || t.mech === 'a' || t.mech === '*'))
            setTile(g, i, WATER, WATER_TICKS); // fire and oil are washed away, water stays
          else if (t.kind === 'station' && t.wood) {
            const w = g.stations.findIndex((s) => s.tx === x + dx && s.ty === y + dy);
            if (w >= 0 && g.mech!.wood?.[w]) g.mech!.wood[w] = 0; // a wet fire is out
          }
        }
    }
    if (!g.flags!.mech.oil) ageTiles(g); // the oil module ages the layer; alone, the sprinkler does
  },
  hashExtra: (g) => [ext(g).tick, ...ext(g).heads.flatMap((h) => [h.on, h.next, h.cool])],
};
