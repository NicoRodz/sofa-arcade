// Reversible belts, the phone: violet for whoever stands on a belt in the 3 s before the flip. Pure read; the screen forwards it with the hint (hook requested: MechModule.phone).
import type { Game, Player } from '../../round/state';
import { surfaceAt } from '../../surfaces/physics';
import { BELT_WARN } from './module';

export interface PhoneNote {
  tone: 'violet';
  label: string;
  sfx?: 'chime';
  key: string;
}
export function beltPhone(g: Game, p: Player): PhoneNote | null {
  const b = g.mech?.belt;
  if (!b || b.next > BELT_WARN || surfaceAt(g, p.x, p.y)?.kind !== 'belt') return null;
  return { tone: 'violet', label: 'Cinta gira', sfx: 'chime', key: `flip${b.reversed ? 1 : 0}` };
}
