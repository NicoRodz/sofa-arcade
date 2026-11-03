// Manchazo's scene, PR6 layer (flag `sabotageV2`): the packing tape on the floor (a kraft strip with ink hatching and a border in the colour of the team that put it, a
// white flash when it lands, a filling outline during the 12-tick wind-up) and around a body the sponge v2 (the diamond it soaks from, then the diamond it will squeeze into
// with a clock arc that runs down, a green sponge over its head that grows with each tile it holds, gold at 9 where the diamond grows to radius 3) and the burst/squeeze
// diamond that flies out. Chunky on purpose: it has to read from the sofa. No logic: it reads the sim's state.
import {
  SPONGE_BIG_AT,
  SPONGE_BIG_RADIUS,
  SPONGE_HOLD_TICKS,
  SPONGE_RADIUS,
  SQUEEZE_FX_TICKS,
  TAPE_WINDUP_TICKS,
  WRAP_FX_TICKS,
  lineTiles,
  type ManchazoState,
} from '../../sim';
import { CARD_COLOR } from '../art/glyphs';
import { INK } from '../art/shapes';
import { TEAM_COLOR } from '../match/scene-body';
import { onTop, type Frame } from '../match/scene-frame';

const BLINK_TICKS = 60; // a tape in its last second blinks
const GOLD = 0xffd23f;
const MAP_W = 27;

/** A diamond outline of Manhattan `radius` tiles (plus half a tile: it reaches the far edge of the last tile) around (x, y). */
function diamond({ g, px }: Frame, x: number, y: number, radius: number, color: number, alpha: number, w: number, fill = 0) {
  const r = (radius + 0.5) * px;
  if (fill > 0)
    g.fillStyle(color, fill).fillPoints(
      [
        { x, y: y - r },
        { x: x + r, y },
        { x, y: y + r },
        { x: x - r, y },
      ] as never,
      true,
    );
  g.lineStyle(w, color, alpha)
    .beginPath()
    .moveTo(x, y - r)
    .lineTo(x + r, y)
    .lineTo(x, y + r)
    .lineTo(x - r, y)
    .closePath()
    .strokePath();
}

/** One tile of tape: kraft fill, two ink hatch lines and a border of the team's colour. */
function tapeTile(f: Frame, tx: number, ty: number, team: number, alpha: number) {
  const { g, x0, y0, px } = f;
  const [rx, ry] = [x0 + tx * px, y0 + ty * px];
  g.fillStyle(CARD_COLOR.tape, 0.92 * alpha).fillRect(rx + 2, ry + 2, px - 4, px - 4);
  g.lineStyle(5, INK, 0.8 * alpha);
  for (const k of [0.3, 0.7]) g.lineBetween(rx + px * (k - 0.25), ry + 4, rx + px * (k + 0.25), ry + px - 4);
  g.lineStyle(6, TEAM_COLOR[team]!, alpha).strokeRect(rx + 3, ry + 3, px - 6, px - 6);
}

/** On the floor: the strips of tape that are down, and the lines that are about to land. */
export function drawWrapFloor(f: Frame, s: ManchazoState) {
  const w = s.match.sab?.plus?.wrap;
  if (!w) return;
  for (const t of w.strips) {
    if (t.left < BLINK_TICKS && Math.floor(t.left / 6) % 2 === 0) continue;
    for (const i of t.tiles) tapeTile(f, i % MAP_W, Math.floor(i / MAP_W), t.team, 1);
    const fx = w.fx[t.owner]!;
    if (fx > 0)
      for (const i of t.tiles)
        f.g
          .fillStyle(0xffffff, (0.8 * fx) / WRAP_FX_TICKS)
          .fillRect(f.x0 + (i % MAP_W) * f.px, f.y0 + Math.floor(i / MAP_W) * f.px, f.px, f.px); // it just landed
  }
  s.grid.bodies.forEach((b, i) => {
    const left = w.prep[i]!;
    if (left === 0) return;
    const k = 1 - left / TAPE_WINDUP_TICKS;
    for (const t of lineTiles(s, w.aim[i]!.x, w.aim[i]!.y, w.aim[i]!.dir)) {
      const [rx, ry] = [f.x0 + (t % MAP_W) * f.px, f.y0 + Math.floor(t / MAP_W) * f.px];
      f.g.fillStyle(TEAM_COLOR[b.team]!, 0.12 + 0.45 * k).fillRect(rx + 2, ry + 2, f.px - 4, f.px - 4);
      f.g.lineStyle(5, CARD_COLOR.tape, 0.6 + 0.4 * Math.sin(s.grid.tick / 2)).strokeRect(rx + 4, ry + 4, f.px - 8, f.px - 8);
    }
  });
}

/** Around body i at (x, y): the soaking sponge, its clock and its burst. */
export function drawWrapCarrier(f: Frame, s: ManchazoState, i: number, x: number, y: number) {
  const p = s.match.sab?.plus;
  const w = p?.wrap;
  if (!p || !w) return;
  const t = s.grid.tick;
  const n = p.soaked[i]!;
  if (p.sponge[i]! > 0) {
    const big = n >= SPONGE_BIG_AT;
    if (w.soak[i]! > 0)
      diamond(f, x, y, SPONGE_RADIUS, CARD_COLOR.sponge, 0.7 + 0.3 * Math.sin(t / 3), 7, 0.1); // it is soaking: this is what it takes
    else diamond(f, x, y, big ? SPONGE_BIG_RADIUS : SPONGE_RADIUS, big ? GOLD : CARD_COLOR.sponge, 0.8, 5); // where it will squeeze
    const frac = p.sponge[i]! / SPONGE_HOLD_TICKS; // the clock: an arc that runs down
    f.g
      .lineStyle(9, big ? GOLD : CARD_COLOR.sponge, 1)
      .beginPath()
      .arc(x, y, f.px * 0.7, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * frac)
      .strokePath();
    const o = onTop(f);
    const r = f.px * (0.3 + 0.035 * Math.min(n, 14)); // the sponge over its head grows with every tile it holds
    const [cx, cy] = [x, y - f.px * 1.05];
    o.g.fillStyle(INK, 1).fillCircle(cx, cy, r + 4);
    o.g.fillStyle(big ? GOLD : CARD_COLOR.sponge, 1).fillCircle(cx, cy, r);
    o.g.fillStyle(INK, 0.55);
    for (const [dx, dy] of [
      [-0.35, -0.25],
      [0.3, -0.1],
      [-0.05, 0.35],
    ] as const)
      o.g.fillCircle(cx + dx * r, cy + dy * r, r * 0.16);
  }
  const fx = p.squeezeFx[i]!;
  if (fx > 0) {
    const k = 1 - fx / SQUEEZE_FX_TICKS;
    const burst = w.log.some((e) => e.body === i && e.kind === 'burst' && t - e.tick < SQUEEZE_FX_TICKS + 2);
    const color = burst ? TEAM_COLOR[1 - s.grid.bodies[i]!.team]! : CARD_COLOR.sponge; // a burst is the attacker's colour
    diamond(f, x, y, SPONGE_RADIUS + k * 1.5, color, 1 - k, 10, 0.25 * (1 - k));
  }
}
