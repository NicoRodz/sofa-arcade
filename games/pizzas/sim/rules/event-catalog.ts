// The catalog of the mid-round events and what the lobby switches on for a round: kinds, durations, banner names, the lobby options (events, recipes), the pace and `roundRules`. Pure data and pure reads;
// `midround.ts` re-exports all of it, so the imports of the rest of the sim do not change.
import type { Difficulty } from '@pichi/core';
import { magnetFor } from '../feel/magnet';
import type { EventKind } from './types';

export const EVENT_KINDS: readonly EventKind[] = ['rush', 'inspector', 'blackout', 'birthday', 'rat', 'frost', 'spill'];
export const EVENTS_SEED_TAG = 0xe7e47e55;
export const EVENT_FROM_MS = 60_000; // the event starts between these two instants of the match
export const EVENT_TO_MS = 120_000;
export { ANNOUNCE_MS } from './announce';
export const ACTIVE_MS: Record<EventKind, number> = {
  rush: 3000,
  inspector: 20_000,
  blackout: 10_000,
  birthday: 3000,
  rat: 25_000,
  frost: 30_000,
  spill: 3000,
}; // how long it counts as "on" (the rat leaves earlier when it is gone)
export const RUSH_ORDERS = 3;
export const EVENT_MAX_QUEUE = 6; // a rush never grows a queue past what the order strip can show
export const INSPECTOR_BONUS = 100;
export const BIRTHDAY_POINTS = 150;

/** Names for the banner and the lobby (Spanish: the screen shows them as they are). */
export const EVENT_INFO: Record<EventKind, { title: string; blurb: string }> = {
  rush: { title: '¡HORA PUNTA!', blurb: 'Llegan 3 pedidos de golpe' },
  inspector: { title: '¡INSPECTOR!', blurb: 'Sin platos sucios al terminar: +100' },
  blackout: { title: '¡CORTE DE LUZ!', blurb: 'Hornos apagados 10 s' },
  birthday: { title: '¡CUMPLEAÑOS!', blurb: 'Pedido triple: 150 puntos' },
  rat: { title: '¡UNA RATA!', blurb: 'Huye si te acercas: atrápala cuando jadee o arrinconada' },
  frost: { title: '¡OLA DE FRÍO!', blurb: 'Todo el piso es hielo 30 s' },
  spill: { title: '¡DERRAME!', blurb: 'Manchas de aceite por la cocina' },
};

/** The lobby option: events on or off. Missing = the difficulty's default (Sí in Normal and Difícil, No in Fácil). */
export const EVENTS_OPTION = 'events';
export const defaultEvents = (d: Difficulty) => d !== 'easy';
export const eventsOf = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined, d: Difficulty): boolean => {
  const v = modeOptions?.[EVENTS_OPTION];
  return typeof v === 'boolean' ? v : defaultEvents(d);
};

/** The lobby option: the map's Carta del día (recipes/cards.ts) on or off. Missing = on (there is no switch for it on the screen yet: a test or a later menu sets it to false). */
export const RECIPES_OPTION = 'recipes';
export const recipesOf = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined): boolean => {
  const v = modeOptions?.[RECIPES_OPTION];
  return typeof v === 'boolean' ? v : true;
};

/** How much faster than the base table the lobby rounds serve orders: the playtest of 25-oct found Normal too slack once the controls got good (spare time, one oven was enough). */
export const PACE: Record<Difficulty, number> = { easy: 1.2, normal: 1.6, hard: 1.8 };

/** What the lobby switches on for a round (coop and versus alike): the burning oven always (the sim leaves the fire out on Easy and under the Suave sabotage), the event by the option, the map's card of recipes, the magnetism of the chefs. */
export const roundRules = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined, d: Difficulty) => ({
  burn: true,
  fire: true,
  events: eventsOf(modeOptions, d),
  recipes: recipesOf(modeOptions),
  magnet: magnetFor(modeOptions, d),
  pace: PACE[d],
  frost: true,
  versusV3: true, // VERSUS_V3: a rat per kitchen and the Ola de frio in versus (ignored by a coop round)
}); // magnet (feel/magnet.ts): on in every lobby round, stronger in Easy; the option `magnet: false` turns it off
