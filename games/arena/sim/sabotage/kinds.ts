// The sabotages: the five of v1 (F3) and the five of F8a (flag `sabotagePlus`): what each does and the answer to it. Seconds are written once and converted to 60 Hz ticks here. Data only.
import { TICK_HZ, ms2ticks } from '../grid/config';

export type SabotageKind = 'turpentine' | 'roller' | 'fan' | 'footprints' | 'glue' | 'tape' | 'ink' | 'sponge' | 'swap' | 'dizzy';
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

/**
 * F8a: the five new ones. PLAN §14 asks whether Cambiazo and Mareo are too chaotic; the plan recommends nothing, so both ship (behind the flag) and this list is
 * the one-line switch for the playtest: take 'swap' or 'dizzy' out of it and the deck is drawn from the rest (6 of 9 or 8).
 */
export const PLUS_SABOTAGES: readonly { kind: SabotageKind; name: string; effect: string; answer: string }[] = [
  {
    kind: 'tape',
    name: 'Cinta',
    effect: 'Durante 6 s nadie repinta ni borra tu pintura en el 3x3 donde la pones',
    answer: 'El borde de cinta lo anuncia: pinta alrededor o espera; solo guarda tu color, el piso neutro o rival del cuadro sigue abierto',
  },
  {
    kind: 'ink',
    name: 'Tinta invisible',
    effect: 'Durante 6 s tu pintura nueva se ve neutra en la tele y no suma al marcador; luego se revela de golpe',
    answer: 'La simulación sí la cuenta; el aguarrás, la lluvia y la aspiradora la borran igual; combina con el marcador oculto',
  },
  {
    kind: 'sponge',
    name: 'Esponja',
    effect: 'Primer B: absorbe la pintura rival del 3x3 (queda neutra, guarda hasta 9). Segundo B antes de 5 s: la exprime en espiral a tu alrededor',
    answer: 'Sin pintura rival en el 3x3 no se gasta; si no la exprimes a tiempo, se pierde',
  },
  {
    kind: 'swap',
    name: 'Cambiazo',
    effect: 'Cambias de lugar con el rival más cercano a 6 casillas o menos (empate: el de menor id); ambos quedan inmunes a manchones 0,5 s',
    answer: 'Sin rival en rango no se gasta; te deja lejos de tu territorio',
  },
  {
    kind: 'dizzy',
    name: 'Mareo',
    effect: 'Tras 0,5 s de carga visible, los rivales a 2 casillas o menos juegan 3 s con el stick invertido',
    answer: 'La carga deja tiempo para alejarse (el celular vibra); un manchón al lanzador corta la carga; el Cambiazo da inmunidad',
  },
];

export const KINDS: readonly SabotageKind[] = SABOTAGES.map((s) => s.kind); // the v1 five: the deck of a round without the flag
export const PLUS_KINDS: readonly SabotageKind[] = PLUS_SABOTAGES.map((s) => s.kind);
export const ALL_KINDS: readonly SabotageKind[] = [...KINDS, ...PLUS_KINDS]; // the deck of a round with the flag; the order the hash codes the cards by
export const DECK_SIZE = 6; // the plan's mazo: 6 of the catalog's 10 (with the flag off the catalog is the v1 five, so the deck holds them all)
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

// F8a (flag `sabotagePlus`)
export const TAPE_TICKS = 6 * TICK_HZ;
export const TAPE_HALF = 1; // the 3x3 around the tile where it is put
export const INK_TICKS = 6 * TICK_HZ;
export const SPONGE_TICKS = 5 * TICK_HZ; // the second B must come within this
export const SPONGE_MAX = 9;
export const SWAP_RANGE = 6; // Manhattan tiles to the rival it swaps with
export const IMMUNE_TICKS = ms2ticks(500); // after a swap: no stain, no dizziness
export const SWAP_FX_TICKS = ms2ticks(500);
export const SQUEEZE_FX_TICKS = ms2ticks(500);
export const DIZZY_CHARGE_TICKS = ms2ticks(500);
export const DIZZY_RANGE = 2; // Manhattan tiles from the caster when the charge ends
export const DIZZY_TICKS = 3 * TICK_HZ;
