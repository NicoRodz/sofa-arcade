// The five v1 sabotages (F3): what each does and the answer to it. Seconds are written once and converted to 60 Hz ticks here. Data only.
import { TICK_HZ, ms2ticks } from '../grid/config';

export type SabotageKind = 'turpentine' | 'roller' | 'fan' | 'footprints' | 'glue';
/** The two cards that ride on the next pinata instead of acting now. */
export type Armable = Extract<SabotageKind, 'turpentine' | 'glue'>;

/** The catalog, in the order the deck is shuffled from. `answer` is the counter (the plan's "cómo se contrarresta"). */
export const SABOTAGES: readonly { kind: SabotageKind; name: string; effect: string; answer: string }[] = [
  {
    kind: 'turpentine',
    name: 'Aguarrás',
    effect: 'Tu siguiente piñata borra la pintura rival del rombo en vez de pintar',
    answer: 'Queda piso neutro, sin ganancia para nadie: repíntalo; se ve blanca y estalla a los 2 s como cualquiera',
  },
  {
    kind: 'roller',
    name: 'Rodillo',
    effect: 'Durante 3 s avanzas recto pintando el piso que pisas (el stick no gira)',
    answer: 'Un estallido rival que te alcance lo corta; un mueble lo frena; la línea se repinta',
  },
  {
    kind: 'fan',
    name: 'Ventilador',
    effect: 'Empuja 2 casillas, lejos de ti, las piñatas a 4 casillas o menos',
    answer: 'Una piñata pegada a un mueble no se mueve; la mecha sigue: también empuja las tuyas',
  },
  {
    kind: 'footprints',
    name: 'Huellas',
    effect: 'Durante 5 s los rivales que se mueven pintan de tu color donde pisan',
    answer: 'Quédate quieto o sal de tu territorio; tu propio estallido repinta',
  },
  {
    kind: 'glue',
    name: 'Pegote',
    effect: 'Tu siguiente piñata se pega al rival más cercano (6 casillas) y estalla donde él esté',
    answer: 'Sin rival cerca no se gasta; el estallido lo cortan los muebles: métete en un callejón',
  },
];

export const KINDS: readonly SabotageKind[] = SABOTAGES.map((s) => s.kind);
export const DECK_SIZE = 6; // the plan's mazo: 6 of the catalog's 10; with the v1 five the deck holds them all (F8a widens the catalog)
export const DECK_SEED_TAG = 0x44454b31; // substream (seed ^ tag): the shuffled deck
export const PICKUP_SEED_TAG = 0x50434b31; // substream (seed ^ tag): where the pickups stand
export const PICKUP_PAIRS = 3; // pickups come in mirror pairs, one per band of rows
export const PICKUP_RESPAWN_TICKS = 12 * TICK_HZ; // a taken pickup comes back (the next card of the deck) after this
export const ROLLER_TICKS = 3 * TICK_HZ;
export const FOOTPRINT_TICKS = 5 * TICK_HZ;
export const FAN_RANGE = 4; // Manhattan tiles
export const FAN_PUSH = 2; // tiles
export const FAN_FX_TICKS = ms2ticks(400); // how long the TV draws the gust
export const GLUE_RANGE = 6; // Manhattan tiles to the rival it sticks to
