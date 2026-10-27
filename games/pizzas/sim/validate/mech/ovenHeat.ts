// Static validator of 'ovenHeat'. Implemented by T1b. Each load or pick-up costs 300 of 1000 and an oven recovers 4 a tick: one oven for a big crew starves, so from 5 chefs the map needs two.
import type { MechValidator } from '../../mech/types';

export const ovenHeatValidate: MechValidator = (rows, n) => {
  if (!rows.length) return [];
  const ovens = rows.join('').split('O').length - 1;
  if (!ovens) return ['ovenHeat: the map has no oven O'];
  if (n >= 5 && ovens < 2) return [`ovenHeat: ${n} chefs on one oven: the temperature never recovers, add a second O`];
  return [];
};
