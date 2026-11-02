// Test helpers for Manchazo: a body put on a tile, a round stepped with a drop, and scripted players (a stick held for a few ticks, a pinata now and then).
import { mulberry32 } from '@pichi/core';
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../sim';

export const NONE_IN: ManchazoInput = { sx: 0, sy: 0, drop: false };
export const DROP: ManchazoInput = { sx: 0, sy: 0, drop: true };

export function duel(seed = 1, teams: readonly number[] = [0, 1]): ManchazoState {
  return createManchazo({ slots: teams.map((_t, i) => i), teams, seed: seed | 1 });
}
export function put(s: ManchazoState, i: number, tx: number, ty: number) {
  s.grid.bodies[i]!.x = tx * 16 + 8;
  s.grid.bodies[i]!.y = ty * 16 + 8;
}
export const tick = (s: ManchazoState, inputs: Record<number, ManchazoInput> = {}, n = 1) => {
  for (let k = 0; k < n; k++) stepManchazo(s, new Map(Object.entries(inputs).map(([slot, v]) => [Number(slot), v])));
};
export const tileOwner = (s: ManchazoState, x: number, y: number) => s.match.paint[y * 27 + x]!;

/** A scripted player: a random stick held 3-40 ticks, a pinata about every 70 ticks. Same seed, same script. `flip` mirrors it left-right. */
export function scripts(n: number, seed: number, flip = false) {
  return Array.from({ length: n }, (_, i) => {
    const rnd = mulberry32(seed + i * 7919);
    let left = 0;
    let cur = { sx: 0, sy: 0 };
    return (): ManchazoInput => {
      if (left-- <= 0) {
        left = 3 + Math.floor(rnd() * 38);
        const a = rnd() * Math.PI * 2;
        const mag = rnd() < 0.15 ? 0 : 200 + Math.floor(rnd() * 800);
        cur = { sx: Math.round(Math.cos(a) * mag), sy: Math.round(Math.sin(a) * mag) };
      }
      const drop = rnd() < 1 / 70;
      return { sx: flip ? -cur.sx : cur.sx, sy: cur.sy, drop };
    };
  });
}

export function play(s: ManchazoState, seed: number, ticks: number, flip = false) {
  const ps = scripts(s.grid.bodies.length, seed, flip);
  for (let t = 0; t < ticks && !s.grid.over; t++) stepManchazo(s, new Map(ps.map((p, i) => [s.grid.bodies[i]!.slot, p()])));
  return s;
}
