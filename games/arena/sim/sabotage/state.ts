// What the sabotages add to a round: the shuffled deck, the pickups on the floor and, per body, what it holds, what is armed for its next pinata and what runs.
import { MAP_W, solidAt, type TileMap } from '../../map';
import { mulberry32, type Rng } from '@pichi/core';
import { createPlus, type PlusState } from './plus';
import { createShots, type ShotState } from '../shot/state';
import { ALL_KINDS, DECK_SEED_TAG, DECK_SIZE, KINDS, PICKUP_PAIRS, PICKUP_SEED_TAG, type Armable, type SabotageKind } from './kinds';

export interface Pickup {
  x: number; // tile
  y: number;
  pair: number; // mirror pair (0..PICKUP_PAIRS-1): both of a pair offer the same card
  drawn: number; // times it was taken: the card on offer is deck[(pair + drawn) % deck.length]
  wait: number; // ticks until it is back (0: on the floor)
}

export interface SabotageState {
  deck: SabotageKind[];
  pickups: Pickup[];
  held: (SabotageKind | null)[]; // per body: the card in hand (button 2 plays it)
  armed: (Armable | null)[]; // per body: 'turpentine' or 'glue' waiting for its next pinata
  roller: number[]; // per body: ticks of rolling left
  footprints: number[]; // per TEAM: ticks left in which that team's bodies leave the other team's footprints
  gust: number[]; // per body: ticks the TV still draws its fan gust (display only, but part of the state)
  used: number; // sabotages played this round
  shot: ShotState | null; // PR4: Pegote, Cambiazo and Mareo are aimed and thrown (flag `projectiles`); null: the round is PR3's, bit for bit
  plus: PlusState | null; // F8a: the five new sabotages (flag `sabotagePlus`); null: the round is F3's, bit for bit
}

/** The deck of a round: the catalog (the v1 five, or all ten with `plus`) shuffled by the substream `seed ^ DECK_SEED_TAG`, the first DECK_SIZE. Same seed, same deck. */
export function drawDeck(seed: number, plus = false): SabotageKind[] {
  const rng = mulberry32((seed ^ DECK_SEED_TAG) >>> 0);
  const cards = [...(plus ? ALL_KINDS : KINDS)];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards.slice(0, DECK_SIZE);
}

const near = (map: TileMap, x: number, y: number): boolean =>
  map.spawns.some((team) => team.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= 3));

/**
 * The pickups: PICKUP_PAIRS mirror pairs (x and MAP_W - 1 - x), one per band of rows, on floor on both sides, in the team's half (columns 4-12) and not within 3
 * tiles of an exit. The tile of each band comes from the substream `seed ^ PICKUP_SEED_TAG`, drawn from candidates in reading order: same seed, same places.
 */
export function placePickups(
  map: TileMap,
  seed: number,
  avoid?: ReadonlySet<number>,
  plaza?: { x: number; y: number; h: number },
): Pickup[] {
  const rng = mulberry32((seed ^ PICKUP_SEED_TAG) >>> 0);
  const out: Pickup[] = [];
  if (plaza) return placeInPlaza(map, rng, plaza, avoid);
  const band = Math.ceil(map.h / PICKUP_PAIRS);
  for (let pair = 0; pair < PICKUP_PAIRS; pair++) {
    const cands: [number, number][] = [];
    for (let y = pair * band; y < Math.min(map.h, (pair + 1) * band); y++)
      for (let x = 4; x <= 12; x++) {
        const ok = (px: number) => !solidAt(map, px, y) && !near(map, px, y) && !avoid?.has(y * MAP_W + px); // F5: never under a living part
        if (ok(x) && ok(MAP_W - 1 - x)) cands.push([x, y]);
      }
    const c = cands[Math.floor(rng() * cands.length)];
    if (c) out.push({ x: c[0], y: c[1], pair, drawn: 0, wait: 0 }, { x: MAP_W - 1 - c[0], y: c[1], pair, drawn: 0, wait: 0 });
  }
  return out;
}

/** Plaza: the three pairs stand inside the plaza (its left-half columns up to 12), one per third of its rows, so the sabotages are fought over in the open middle. */
function placeInPlaza(map: TileMap, rng: Rng, z: { x: number; y: number; h: number }, avoid?: ReadonlySet<number>): Pickup[] {
  const out: Pickup[] = [];
  for (let pair = 0; pair < PICKUP_PAIRS; pair++) {
    const cands: [number, number][] = [];
    for (let y = z.y + Math.floor((pair * z.h) / PICKUP_PAIRS); y < z.y + Math.floor(((pair + 1) * z.h) / PICKUP_PAIRS); y++)
      for (let x = z.x; x <= 12; x++) if (!solidAt(map, x, y) && !near(map, x, y) && !avoid?.has(y * MAP_W + x)) cands.push([x, y]);
    const c = cands[Math.floor(rng() * cands.length)];
    if (c) out.push({ x: c[0], y: c[1], pair, drawn: 0, wait: 0 }, { x: MAP_W - 1 - c[0], y: c[1], pair, drawn: 0, wait: 0 });
  }
  return out;
}

export function createSabotage(
  map: TileMap,
  seed: number,
  bodies: number,
  avoid?: ReadonlySet<number>,
  plus = false,
  plaza?: { x: number; y: number; h: number },
  shots = false,
  wrap = false,
): SabotageState {
  const none = <T>(v: T) => Array.from({ length: bodies }, () => v);
  return {
    deck: drawDeck(seed, plus),
    pickups: placePickups(map, seed, avoid, plaza),
    held: none<SabotageKind | null>(null),
    armed: none<Armable | null>(null),
    roller: none(0),
    footprints: [0, 0],
    gust: none(0),
    used: 0,
    shot: shots ? createShots(bodies) : null,
    plus: plus ? createPlus(bodies, wrap) : null,
  };
}

/** The card a pickup offers now. */
export const cardOf = (s: SabotageState, p: Pickup): SabotageKind => s.deck[(p.pair + p.drawn) % s.deck.length]!;
