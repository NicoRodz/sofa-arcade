// Gate: what the phone shows (design section 3, "Arte y teléfono"): the porter in blue, whoever stands in a D that is about to shut in red with a tick-tock.
// A pure read of the sim, for the screen to forward with the hint (hook requested: MechModule.phone). `key` changes when the note changes: that is when the phone vibrates / plays `sfx`.
import type { Game, Player } from '../../round/state';
import { gateBlinkTicks, gateOpenTicks, gateMap, tileOf } from './state';

export interface PhoneNote {
  tone: 'blue' | 'red'; // the colour the phone takes
  label: string; // 14 characters at most (the hint label limit)
  sfx?: 'tick-tock' | 'clack';
  key: string;
}

export function gatePhone(g: Game, p: Player): PhoneNote | null {
  const m = g.mech?.gate && gateMap(g);
  if (!m) return null;
  const at = tileOf(p);
  if (m.plates.includes(at)) return { tone: 'blue', label: 'Sostén placa', key: 'porter' };
  if (m.doors.includes(at) && m.timer && g.mech!.gate!.phase >= gateOpenTicks(g) - gateBlinkTicks(g) && g.mech!.gate!.open)
    return { tone: 'red', label: '¡Sal ya!', sfx: 'tick-tock', key: 'closing' };
  return null;
}
