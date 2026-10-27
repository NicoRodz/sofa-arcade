// Gate: Z pressure plate + D door (design sections 2 and 3). Implemented by T1b (this file; the registry, validator, stamp, bot and art already point here).
// Plate mode: D is open while a chef stands on any Z (objects do not count; one group per map in v1) and it does not shut on an occupied tile. Timer mode (a D and no Z in the map):
// open 480 ticks, closed 360, it blinks the last 60 and waits for the doorway to be empty before shutting. A closed D is a wall for anyone coming from outside; from inside the chef can always leave (panic bar).
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { gateValidate } from '../../validate/mech/gate';
import { gateStamp } from '../../gen/stamps/gate';
import { GATE_CYCLE, GATE_OPEN_TICKS, gateMap, isDoor, scan, standingOn } from './state';

export const gateModule: MechModule = {
  ...noopHooks,
  id: 'gate',
  tanda: 'T1b',
  validate: gateValidate,
  stamp: gateStamp,
  onLoad(g) {
    g.mech!.ext = { ...g.mech!.ext, gate: scan(g) };
  },
  init(g) {
    g.mech!.gate = { open: gateMap(g).timer, phase: 0 }; // phase: timer = ticks into the cycle; plate = ticks since the door last changed
  },
  canEnter(g, tx, ty, _dir, actor) {
    if (!isDoor(g, tx, ty) || g.mech!.gate!.open) return true;
    return isDoor(g, Math.floor(actor.x), Math.floor(actor.y)); // closed: only a chef already in a doorway moves on through it
  },
  tickStations(g) {
    const s = g.mech!.gate!;
    const m = gateMap(g);
    const inDoor = !!standingOn(g, m.doors);
    if (m.timer) {
      if (!(s.open && s.phase === GATE_OPEN_TICKS - 1 && inDoor)) s.phase = (s.phase + 1) % GATE_CYCLE; // it waits at the last open tick while the doorway is occupied
      s.open = s.phase < GATE_OPEN_TICKS;
      return;
    }
    const open = !!standingOn(g, m.plates) || (s.open && inDoor);
    s.phase = open === s.open ? Math.min(s.phase + 1, 0xffff) : 0;
    s.open = open;
  },
  hashExtra: (g) => [g.mech!.gate!.open ? 1 : 0, g.mech!.gate!.phase],
};
