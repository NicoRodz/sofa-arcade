// What the lobby and the banner say about the events, matching what the sim does today: with eventsV2 (coop) the four events with presence have their own lines
// (the cake pays CAKE_PRIZE with a candle, not the flat 150 of EVENT_INFO), and the number of events per round is the calendar of the difficulty (hazards/events-v2.ts).
import type { Difficulty } from '@pichi/core/difficulty';
import { hazardParams } from '../hazards/hazard-v2';
import { EVENT_INFO, type EventKind } from '../midround';
import { RED_PRIZE, SPILL_PRIZE, cakeLine } from './state';

const V2_BLURB: Partial<Record<EventKind, (d: Difficulty) => string>> = {
  rush: () => `Tickets rojos: despáchalos a tiempo, +${RED_PRIZE} cada uno`,
  birthday: (d) => `${cakeLine(d)} puntos, con vela`,
  blackout: () => 'Sin luz: mantén B en el tablero para encenderla',
  spill: () => `Limpia las manchas antes de que sequen: +${SPILL_PRIZE}`,
};

/** The one-line blurb of an event: the eventsV2 line when the round has the events with presence, else EVENT_INFO's. */
export const eventBlurb = (kind: EventKind, d: Difficulty, ev2: boolean): string => (ev2 ? V2_BLURB[kind]?.(d) : undefined) ?? EVENT_INFO[kind].blurb;

/** The tooltip of the lobby's "Eventos" switch: how many events a round has on this difficulty and which ones. */
export function eventsHint(on: boolean, d: Difficulty, vs: boolean): string {
  if (!on) return 'Sin eventos';
  const n = hazardParams(d).events.windows.length;
  return `${n} ${n === 1 ? 'evento' : 'eventos'} por ronda${vs ? '' : ': hora punta, cumpleaños con torta, corte de luz, derrame y más'}`;
}
