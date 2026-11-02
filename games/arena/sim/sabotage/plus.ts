// What the five F8a sabotages add to a round (flag `sabotagePlus`): the tapes on the floor, the invisible ink, and per body the sponge, the dizzy charge, the dizziness and the immunity.
import { MAP_H, MAP_W } from '../../map';

export interface Tape {
  x: number; // centre tile of the 3x3
  y: number;
  team: number; // whose paint it keeps
  left: number; // ticks
}

export interface PlusState {
  tapes: Tape[];
  veil: number[]; // per TEAM: ticks left in which that team's new paint is hidden
  veiled: Uint8Array; // per tile: 1 = painted under a veil, still hidden (the TV draws it neutral, the marker leaves it out)
  sponge: number[]; // per body: ticks left to squeeze (0: not soaking)
  soaked: number[]; // per body: tiles of paint the sponge holds
  charge: number[]; // per body: ticks left of the dizzy charge (0: none)
  dizzy: number[]; // per body: ticks left with the stick inverted
  immune: number[]; // per body: ticks left of the swap's immunity
  swapFx: number[]; // per body: ticks the TV still draws the swap (display only, but part of the state)
  squeezeFx: number[]; // per body: same for the sponge's squeeze
}

export function createPlus(bodies: number): PlusState {
  const zeros = () => Array.from({ length: bodies }, () => 0);
  return {
    tapes: [],
    veil: [0, 0],
    veiled: new Uint8Array(MAP_W * MAP_H),
    sponge: zeros(),
    soaked: zeros(),
    charge: zeros(),
    dizzy: zeros(),
    immune: zeros(),
    swapFx: zeros(),
    squeezeFx: zeros(),
  };
}

/** The part of the round's hash that F8a adds (mixed only when the flag is on). */
export function plusWords(p: PlusState): number[] {
  return [
    ...p.tapes.flatMap((t) => [t.x, t.y, t.team, t.left]),
    ...p.veil,
    ...p.veiled,
    ...p.sponge,
    ...p.soaked,
    ...p.charge,
    ...p.dizzy,
    ...p.immune,
    ...p.swapFx,
    ...p.squeezeFx,
  ];
}
