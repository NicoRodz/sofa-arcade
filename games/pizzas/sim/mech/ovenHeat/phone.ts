// Thermal oven, the phone: an amber "Horno frío" for the chef standing next to an oven under 40 % (the baking there runs at under 640 permil). Pure read; hook requested: MechModule.phone.
import type { Game, Player } from '../../round/state';

export interface PhoneNote {
  tone: 'amber';
  label: string;
  sfx?: 'clack';
  key: string;
}
export function heatPhone(g: Game, p: Player): PhoneNote | null {
  for (const [k, t] of Object.entries(g.mech?.heat ?? {})) {
    const s = g.stations[Number(k)]!;
    if (t < 400 && Math.hypot(s.tx + 0.5 - p.x, s.ty + 0.5 - p.y) < 1.6) return { tone: 'amber', label: 'Horno frío', key: 'cold' };
  }
  return null;
}
