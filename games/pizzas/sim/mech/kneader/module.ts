// Kneader M, implemented by T1e (design section 2). The dough crate hands out the raw ball (raw0) as always, but a board refuses it: the ball goes on M, two chefs hold B on the two handles
// (one chef alone works at x0.35, never impossible) and M turns it into the stretched dough (cut0) that goes straight to the oven. Progress stays on M when they let go.
import type { Controls, Game, Player, Station } from '../../round/state';
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { kneaderValidate } from '../../validate/mech/kneader';
import { kneaderStamp } from '../../gen/stamps/kneader';
import { emitMech, callOther } from './call';
import { hz3Params } from '../../hazards/hazard-v3';
import {
  GOAL,
  NEED_AFTER,
  PAIR,
  aloneTicks,
  handleOf,
  handlesOf,
  kneading,
  scanHandles,
  setAlone,
  setHandles,
  slot,
  startExt,
} from './state';

const kneaders = (g: Game) => g.stations.flatMap((s, i) => (s.kind === 'kneader' ? [i] : []));

/** A: the ball goes onto M, the dough comes off it; and a board refuses the unkneaded ball. true = this chef's A presses are used up. */
function pressA(g: Game, p: Player, c: Controls, target: Station | null): boolean {
  if (!target || (c.a <= 0 && p.buffA <= 0)) return false;
  if (target.kind === 'board' && p.item === 'raw0' && !target.item) {
    p.buffA = 0;
    emitMech(g, 'interactInvalid', { player: p.id }); // the dough goes through M first
    return true;
  }
  if (target.kind !== 'kneader' || target.fire !== undefined) return false;
  const st = slot(g, target)!;
  if (p.item === 'raw0' && !target.item) {
    target.item = 'raw0';
    target.progress = st.prog / GOAL;
    p.item = null;
    emitMech(g, 'itemDropped', { player: p.id, item: 'raw0', at: 'kneader' });
  } else if (!p.item && target.item === 'cut0') {
    p.item = 'cut0';
    target.item = null;
    st.prog = 0;
    target.progress = 0;
    emitMech(g, 'itemPicked', { player: p.id, item: 'cut0', from: 'kneader' });
  } else return false;
  p.buffA = 0;
  return true;
}

export const kneaderModule: MechModule = {
  ...noopHooks,
  id: 'kneader',
  tanda: 'T1e',
  validate: kneaderValidate,
  stamp: kneaderStamp,
  onLoad(g) {
    startExt(g);
  },
  init(g) {
    g.mech!.kneader = {};
    for (const i of kneaders(g)) {
      g.mech!.kneader[i] = { prog: 0, hands: [0, 0] }; // hands: the chef (id) that held B on each handle this tick, 0 = nobody
      setHandles(g, i, scanHandles(g, g.stations[i]!));
    }
  },
  beforeMove(g) {
    for (const i of kneaders(g)) g.mech!.kneader![i]!.hands = [0, 0]; // refilled by this tick's chefs, read by the tick's stations and by the phone hints
  },
  claimsB: (g, p, target) => !!target && target.kind === 'kneader' && kneading(target) && handleOf(g, g.stations.indexOf(target), p) >= 0,
  onInteract(g, p, c, target) {
    if (c.b && target && target.kind === 'kneader' && kneading(target)) {
      const i = g.stations.indexOf(target);
      const h = handleOf(g, i, p);
      if (h >= 0) g.mech!.kneader![i]!.hands[h] = p.id;
    }
    return pressA(g, p, c, target);
  },
  tickStations(g) {
    for (const i of kneaders(g)) {
      const s = g.stations[i]!;
      const st = g.mech!.kneader![i]!;
      const working = st.hands.filter((id) => id > 0);
      if (kneading(s) && working.length && s.fire === undefined) {
        st.prog = Math.min(GOAL, st.prog + (working.length > 1 ? PAIR : hz3Params(g).kneader.solo));
        s.progress = st.prog / GOAL;
        if (st.prog >= GOAL) {
          s.item = 'cut0'; // the dough is ready: the clac, for the chefs that were on the handles
          for (const id of working) emitMech(g, 'chopDone', { player: id, station: i });
        }
      }
      const lone = kneading(s) && working.length === 1;
      setAlone(g, i, lone ? aloneTicks(g, i) + 1 : 0);
      if (lone && aloneTicks(g, i) === NEED_AFTER) callOther(g, 'kneader', i, working); // "missing a chef": the amber alert of someone else's phone
    }
  },
  hashExtra: (g) =>
    kneaders(g).flatMap((i) => [g.mech!.kneader![i]!.prog, g.stations[i]!.item ? 1 : 0, aloneTicks(g, i), handlesOf(g, i).length]),
};
