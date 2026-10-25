// Bot and keyboard controllers for the harness.
import type { Controller } from './world';

import { PLAYER_H, PLAYER_W, TILE, T, tileAt } from '../../../index';

// ---- bots and keyboard for the harness
export function botController(opts: { idle?: ReadonlySet<number>; jumpyEvery?: number } = {}): Controller {
  const last = new Map<number, number>();
  return (i, w) => {
    if (opts.idle?.has(i)) return { move: 0, down: false, jump: false };
    const body = w.body(i),
      g = w.grid;
    const dir = 1;
    const ahead = (dx: number, dy: number) =>
      tileAt(g, Math.floor((body.x + PLAYER_W / 2 + dir * dx) / TILE), Math.floor((body.y + dy) / TILE));
    const wall = ahead(PLAYER_W / 2 + 10, PLAYER_H - 6) === T.Solid || ahead(PLAYER_W / 2 + 10, 6) === T.Solid;
    const noFloor = ahead(PLAYER_W / 2 + 18, PLAYER_H + 6) !== T.Solid && ahead(PLAYER_W / 2 + 18, PLAYER_H + 6) !== T.OneWay;
    const lastJ = last.get(i) ?? -99;
    const t = w.timeSec;
    let jump = false;
    if (body.grounded && (wall || noFloor || (opts.jumpyEvery && ((t * 60 + i * 7) | 0) % opts.jumpyEvery === 0)) && t - lastJ > 0.35) {
      jump = true;
      last.set(i, t);
    }
    return { move: 1, down: false, jump };
  };
}
