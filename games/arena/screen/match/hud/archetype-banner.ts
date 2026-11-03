// The map's name shouted at the start of the round ("¡ISLAS!"), as plain data: what to write, and how big and how opaque it is at each tick. It covers the floor for
// 90 ticks (1.5 s at 60 Hz), pops in during the first 8 and fades during the last 12. No Phaser: `archetype-fx.ts` draws it, `archetype-banner.test.ts` reads it.
import { ARCHETYPE_NAMES, type MapKind } from '../../../map';

export const ARCHETYPE_TICKS = 90;
const POP_IN = 8;
const FADE_OUT = 12;

/** One line under the name: what to expect on this map. */
export const ARCHETYPE_HINTS: Readonly<Record<MapKind, string>> = {
  pasillos: 'Pasillos largos y sofás que cierran el paso',
  islas: 'Salas cerradas con puertas de una casilla',
  plaza: 'Una plaza abierta al centro y muebles a los lados',
  ocho: 'Dos vueltas alrededor de un bloque, juntas al centro',
  clasico: 'Muebles repartidos por todo el piso',
};

export interface ArchetypeBanner {
  title: string; // "¡ISLAS!"
  sub: string;
  age: number; // ticks since the round began
  scale: number; // 1.4 at the first tick, 1 once popped in
  alpha: number; // 1, then down to 0 over the last 12 ticks
}

const ease = (t: number) => 1 - (1 - Math.min(1, t)) ** 3;

/** The banner at `tick` of a round on a map of `kind`; null when there is no archetype (the hand-made map) or the 90 ticks are over. */
export function archetypeBanner(tick: number, kind: MapKind | null): ArchetypeBanner | null {
  if (kind === null || tick < 0 || tick >= ARCHETYPE_TICKS) return null;
  return {
    title: `¡${ARCHETYPE_NAMES[kind]}!`,
    sub: ARCHETYPE_HINTS[kind],
    age: tick,
    scale: 1 + 0.4 * (1 - ease(tick / POP_IN)),
    alpha: tick >= ARCHETYPE_TICKS - FADE_OUT ? (ARCHETYPE_TICKS - tick) / FADE_OUT : 1,
  };
}
