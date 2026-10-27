// The lobby's options for the generated coop map ("Mapa aleatorio"): the master switch "Mecánicas" and one tick per mechanic the generator can place.
// modeOptions allows only 8 entries, so the ticks travel as ONE bitmask (bit i = GEN_MECHS[i]); none ticked = the generator chooses by difficulty.
import { GEN_MECHS } from './place';
import type { MechId } from '../mech/ids';

type Opts = Readonly<Record<string, boolean | number | string>> | undefined;
export const MECHS_OPTION = 'mechs';
export const MECH_PICK_OPTION = 'mechPick';

/** Short labels for the phone (it is narrow). */
export const GEN_MECH_LABEL: Partial<Record<MechId, string>> = {
  kneader: 'Amasadora',
  woodOven: 'Horno de leña',
  oil: 'Aceite',
  sprinkler: 'Rociador',
  oneWay: 'Sentido único',
  bridge: 'Puente',
  beltReverse: 'Cinta inversa',
  ovenHeat: 'Calor del horno',
};

/** Mechanics on the generated map: Sí unless the host turned it off. */
export const mechsOf = (o: Opts): boolean => (typeof o?.[MECHS_OPTION] === 'boolean' ? (o[MECHS_OPTION] as boolean) : true);

/** The ticked mechanics, in GEN_MECHS order (empty = none ticked). */
export const pickedMechs = (o: Opts): MechId[] => {
  const v = o?.[MECH_PICK_OPTION];
  const bits = typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
  return GEN_MECHS.filter((_m, i) => (bits >> i) & 1);
};

/** The bitmask after ticking / unticking one mechanic. */
export const withMech = (o: Opts, id: MechId, on: boolean): number => {
  const i = GEN_MECHS.indexOf(id);
  if (i < 0) return pickedMechs(o).reduce((a, m) => a | (1 << GEN_MECHS.indexOf(m)), 0);
  const cur = pickedMechs(o).reduce((a, m) => a | (1 << GEN_MECHS.indexOf(m)), 0);
  return on ? cur | (1 << i) : cur & ~(1 << i);
};
