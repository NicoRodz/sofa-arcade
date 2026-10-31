// Fragile bridge (design section 3, "Puente b"): a floor tile over water. Each time a chef steps onto it the bridge wears by 1; from 4 it shows cracks; at 6 it breaks the moment it is empty,
// turns into water for 1200 ticks and mends itself. A broken bridge is a wall. (The heavy tray of T2 counts 3 per step through `wear`.) Implemented by T1c.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import type { Game } from '../../round/state';
import { emitMech } from '../kneader/call';
import { BRIDGE_WEAR, carriesHeavy } from '../heavyTray/state';
import { hz3Params } from '../../hazards/hazard-v3';
import { bridgeValidate } from '../../validate/mech/bridge';
import { bridgeStamp } from '../../gen/stamps/bridge';

export const BRIDGE_CRACKS = 4;
export const BRIDGE_BREAKS = 6;
export const bridgeBreaks = (g: Game): number => hz3Params(g).bridge.breaks;
export const BRIDGE_MEND_TICKS = 1200;

interface BridgeExt {
  tick: number;
  last: Record<number, number>; // player id -> tile index the chef was on last tick
}
const ext = (g: Game) => g.mech!.ext!.bridge as BridgeExt;
export const isBroken = (g: Game, tx: number, ty: number): boolean => {
  const b = g.mech!.bridge![ty * 16 + tx];
  return !!b && b.brokenUntil > ext(g).tick;
};
/** A step onto a bridge counts `by` wear (1; 3 with the heavy tray). */
export const wear = (g: Game, idx: number, by = 1) => {
  const b = g.mech!.bridge![idx];
  if (b) b.uses += by;
};

export const bridgeModule: MechModule = {
  ...noopHooks,
  id: 'bridge',
  tanda: 'T1c',
  validate: bridgeValidate,
  stamp: bridgeStamp,
  onLoad(g) {
    g.mech!.ext = { ...g.mech!.ext, bridge: { tick: 0, last: {} } satisfies BridgeExt };
  },
  init(g) {
    const b: Record<number, { uses: number; brokenUntil: number }> = {};
    g.grid.forEach((row, y) =>
      row.forEach((t, x) => t.kind === 'floor' && t.mech === 'b' && (b[y * 16 + x] = { uses: 0, brokenUntil: 0 })),
    );
    g.mech!.bridge = b;
  },
  canEnter: (g, tx, ty) => !isBroken(g, tx, ty),
  tickTiles(g) {
    const e = ext(g);
    e.tick++;
    const bridges = g.mech!.bridge!;
    const occupied = new Set<number>();
    for (const p of g.players.values()) {
      if (p.ghost) continue;
      const idx = Math.floor(p.y) * 16 + Math.floor(p.x);
      occupied.add(idx);
      if (bridges[idx] && e.last[p.id] !== idx) wear(g, idx, carriesHeavy(g, p) ? BRIDGE_WEAR : 1);
      e.last[p.id] = idx;
    }
    for (const k of Object.keys(bridges)) {
      const idx = Number(k),
        b = bridges[idx]!;
      if (b.brokenUntil > 0 && b.brokenUntil <= e.tick) {
        b.brokenUntil = 0; // mended
        b.uses = 0;
      } else if (b.uses >= bridgeBreaks(g) && !b.brokenUntil && !occupied.has(idx)) {
        b.brokenUntil = e.tick + BRIDGE_MEND_TICKS;
        emitMech(g, 'mech:bridgeBreak', { tile: idx });
      }
    }
  },
  hashExtra: (g) => [ext(g).tick, ...Object.entries(g.mech!.bridge!).flatMap(([i, b]) => [Number(i), b.uses, b.brokenUntil])],
};
