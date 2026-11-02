// Manchazo's scene, F8a layer: the tape's border on the floor, and around the bodies the ink's ghost ring, the sponge's drops, the Mareo's charge aura and spirals,
// the swap's rings and the squeeze's burst. Each has its own colour (the card's) AND shape. No logic: it reads the sim's state.
import { CARD_COLOR } from '../art/glyphs';
import { spiralPts } from '../art/glyphs-plus';
import { INK } from '../art/shapes';
import { DIZZY_CHARGE_TICKS, DIZZY_RANGE, SQUEEZE_FX_TICKS, SWAP_FX_TICKS, type ManchazoState } from '../../sim';
import { TEAM_COLOR } from './scene-body';
import { onTop, type Frame } from './scene-frame';

const BLINK_TICKS = 60; // a tape in its last second blinks

/** Tapes on the floor: a thick beige border with ink hatching round the 3x3 (it reads as tape), a line in the colour of the team whose paint it keeps. */
export function drawTapes({ g, x0, y0, px }: Frame, s: ManchazoState) {
  for (const t of s.match.sab?.plus?.tapes ?? []) {
    if (t.left < BLINK_TICKS && Math.floor(t.left / 6) % 2 === 0) continue;
    const [rx, ry, size] = [x0 + (t.x - 1) * px, y0 + (t.y - 1) * px, px * 3];
    g.lineStyle(9, CARD_COLOR.tape, 0.95).strokeRect(rx + 2, ry + 2, size - 4, size - 4);
    g.lineStyle(3, INK, 0.85);
    for (let k = 10; k < size - 6; k += 18) {
      for (const [ax, ay, dx, dy] of [
        [rx + k, ry - 2, 1, 0],
        [rx + k, ry + size - 8, 1, 0],
        [rx - 2, ry + k, 0, 1],
        [rx + size - 8, ry + k, 0, 1],
      ] as const)
        g.lineBetween(ax, ay, ax + (dx ? 8 : 10), ay + (dy ? 8 : 10));
    }
    g.lineStyle(4, TEAM_COLOR[t.team]!, 1).strokeRect(rx + 12, ry + 12, size - 24, size - 24);
  }
}

const ring = ({ g }: Frame, x: number, y: number, r: number, color: number, alpha: number, w = 5) =>
  g.lineStyle(w, color, alpha).strokeCircle(x, y, r);

/** A spiral of `turns` turns out to radius r, drawn as a line. */
function spiral({ g }: Frame, x: number, y: number, r: number, turns: number, a0: number, color: number, alpha: number, w: number) {
  const pts = spiralPts(x, y, r, turns, a0);
  g.lineStyle(w, color, alpha).beginPath().moveTo(pts[0]![0], pts[0]![1]);
  for (const [px, py] of pts) g.lineTo(px, py);
  g.strokePath();
}

/** Around body i at (x, y): everything F8a puts on a body. */
export function drawPlusCarrier(f: Frame, s: ManchazoState, i: number, x: number, y: number) {
  const p = s.match.sab?.plus;
  if (!p) return;
  const t = s.grid.tick;
  const team = s.grid.bodies[i]!.team;
  if (p.veil[team]! > 0) {
    ring(f, x, y, f.px * 0.7, INK, 0.55, 7); // its team's paint is hidden: a ghost ring, white on a dark underlay so it reads on the cream floor too
    ring(f, x, y, f.px * 0.7, 0xf4f4fa, 0.75 + 0.25 * Math.sin(t / 6), 3);
  }
  if (p.sponge[i]! > 0) {
    ring(f, x, y, f.px * 0.62, CARD_COLOR.sponge, 0.6 + 0.4 * Math.sin(t / 4), 5);
    for (let k = 0; k < p.soaked[i]!; k++)
      f.g.fillStyle(CARD_COLOR.sponge, 1).fillCircle(x - f.px * 0.5 + k * (f.px / 8), y + f.px * 0.84, f.px * 0.07); // one drop per tile held
  }
  if (p.charge[i]! > 0) {
    const k = 1 - p.charge[i]! / DIZZY_CHARGE_TICKS;
    spiral(f, x, y, f.px * (0.4 + (DIZZY_RANGE + 0.5) * k), 2.2, t / 5, CARD_COLOR.dizzy, 0.95, 6); // the aura grows to the reach: leave it
    ring(f, x, y, f.px * (DIZZY_RANGE + 0.5), CARD_COLOR.dizzy, 0.3, 3);
  }
  if (p.dizzy[i]! > 0) spiral(onTop(f), x, y - f.px * 0.82, f.px * 0.3, 2, -t / 4, CARD_COLOR.dizzy, 1, 5); // over its head: the stick is backwards
  if (p.swapFx[i]! > 0)
    ring(f, x, y, f.px * (0.4 + 0.9 * (1 - p.swapFx[i]! / SWAP_FX_TICKS)), CARD_COLOR.swap, p.swapFx[i]! / SWAP_FX_TICKS, 7);
  if (p.immune[i]! > 0) ring(f, x, y, f.px * 0.58, CARD_COLOR.swap, 0.8, 3);
  if (p.squeezeFx[i]! > 0) {
    const k = 1 - p.squeezeFx[i]! / SQUEEZE_FX_TICKS;
    ring(f, x, y, f.px * (0.5 + 1.2 * k), CARD_COLOR.sponge, 1 - k, 8);
  }
}
