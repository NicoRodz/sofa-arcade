// What Pizzas tells the platform about the opaque slots of the wire protocol: which maps, puestos and verdicts travel as `map`, `puestos` and `result`.
import type { GameProtocol, Slots } from '@pichi/core/contract';
import { DEFAULT_MAP, isMapChoice, type MapChoice } from './sim/maps';
import { PUESTO_IDS, isPuestoId, type PuestoId } from './sim/puestos';
import { isVersusChoice, type VersusChoice } from './sim/versus/maps';
import type { PhoneResult } from './sim/versus/report';

export interface PzSlots extends Slots {
  map: MapChoice | VersusChoice;
  puesto: PuestoId;
  result: PhoneResult;
}

export const pizzasProtocol: GameProtocol = {
  game: 'pizzas',
  defaultMap: DEFAULT_MAP,
  isMap: (v) => isMapChoice(v) || isVersusChoice(v), // versus lobbies hold a versus map choice (V1.., vs-auto, vs-random)
  isPuesto: isPuestoId,
  puestoCount: PUESTO_IDS.length,
};
