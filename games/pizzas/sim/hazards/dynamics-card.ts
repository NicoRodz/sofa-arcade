// The card before the round (HAZARD_V3, design 1.2): one icon and one line per dynamic of the map, shown 4 s the first time the dynamic appears in the session. This file is the catalogue of texts and the pure rule
// of what to show; the screen draws it (2a: on the big screen only). A dynamic that was already shown in this session is not shown again.
import type { IconId } from '@pichi/core/icons';
import type { MechId } from '../mech/ids';

export interface DynamicLine {
  icon: IconId;
  line: string; // one line, at most 9 words
}
export const CARD_MS = 4000;
export const DYNAMICS: Readonly<Record<MechId, DynamicLine>> = {
  oil: { icon: 'wash', line: 'Aceite en el piso: resbala. Mantén A para limpiar' },
  sprinkler: { icon: 'wash', line: 'El aspersor moja el piso y apaga el fuego' },
  beltReverse: { icon: 'move', line: 'Las cintas invierten su sentido cada tanto' },
  gate: { icon: 'jump', line: 'Las puertas se abren y cierran: espera el semáforo' },
  bridge: { icon: 'move', line: 'El puente se rompe con los pasos' },
  oneWay: { icon: 'move', line: 'Pasillos de un solo sentido' },
  raft: { icon: 'move', line: 'La balsa lleva a dos chefs a la otra orilla' },
  kneader: { icon: 'dough', line: 'Amasa de a dos: un chef por mango' },
  woodOven: { icon: 'oven', line: 'El horno de leña necesita fuelle: mantén B' },
  ovenHeat: { icon: 'oven', line: 'Cada carga enfría el horno: espera que suba' },
  heavyTray: { icon: 'plate', line: 'La bandeja pesada va mejor entre dos' },
  mutation: { icon: 'move', line: 'La cocina cambia: las estaciones se mueven' },
};

/** The lines of the card for a map's mechanics, in the order of MECH_IDS-independent declaration, skipping what the session already showed. */
export function cardLines(mechanics: readonly MechId[] | undefined, seen: ReadonlySet<MechId>): { id: MechId; line: DynamicLine }[] {
  return (mechanics ?? []).filter((id) => !seen.has(id)).map((id) => ({ id, line: DYNAMICS[id] }));
}
/** The session's memory after showing the card. */
export const markSeen = (seen: Set<MechId>, mechanics: readonly MechId[] | undefined): void => {
  for (const id of mechanics ?? []) seen.add(id);
};
