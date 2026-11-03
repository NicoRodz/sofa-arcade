// Manchazo's scene, F8b events layer: the blackout (on its own Graphics above the avatars), the contagion's marks and pass, Hora feliz's party frame, Mudanza's
// arrows and landings, the balloons. Their art is in ../art/event-art-plus.ts. No logic: it reads the sim's state.
import { MAP_H, MAP_W, mirrorTile } from '../../map';
import { BALLOON_WARN_TICKS, BLACKOUT_LIGHT, contagionTurns, type ManchazoState } from '../../sim';
import {
  drawBalloon,
  drawBalloonSplash,
  drawBlackout,
  drawHappyHour,
  drawInfectMark,
  drawInfectPass,
  drawMoveLand,
  drawMoveWarn,
} from '../art/event-art-plus';
import { TEAM_COLOR } from './scene-body';
import type { Frame } from './scene-frame';

const FADE_TICKS = 20;
const SHOW_TICKS = 40; // a landing / a pass stays on the TV this long

type Px = readonly [number, number];

/** `dark` is the Graphics above the avatars; `clear` is the banner rectangle that stays lit while an announcement is up (null: none). */
export function drawEventsPlus(
  f: Frame,
  s: ManchazoState,
  dark: Frame['g'],
  clear: readonly [number, number, number, number] | null,
): void {
  const ev = s.match.ev;
  const plus = ev?.plus;
  if (!ev || !plus) return;
  const { g, x0, y0, px } = f;
  const t = s.grid.tick;
  const tile = ([x, y]: Px): Px => [x0 + x * px, y0 + y * px];
  const a = ev.active;
  if (a?.kind === 'happyHour') drawHappyHour(g, x0, y0, MAP_W * px, MAP_H * px, t);
  const c = plus.contagion;
  if (c && c.flipped < 0) contagionTurns(s).forEach(([x, y], k) => drawInfectMark(g, ...tile([x, y]), px, t, k));
  else if (c && t - c.fireAt < SHOW_TICKS) drawInfectPass(g, x0, y0, MAP_W * px, MAP_H * px, (t - c.fireAt) / SHOW_TICKS);
  const mv = plus.move;
  if (mv)
    plus.moves.forEach((m, k) => {
      for (const side of [(p: Px): Px => p, mirrorTile]) {
        if (mv.done[k] === 0 && t < mv.at + 3 * 60) drawMoveWarn(g, tile(side(m.from)), tile(side(m.to)), px, t);
        else if (mv.done[k]! > 0 && t - mv.done[k]! < SHOW_TICKS) drawMoveLand(g, tile(side(m.to)), px, (t - mv.done[k]!) / SHOW_TICKS);
      }
    });
  const b = plus.balloon;
  if (b)
    plus.balloons
      .flatMap((p): Px[] => [p, mirrorTile(p)])
      .forEach((p, k) => {
        const [cx, cy] = [x0 + (p[0] + 0.5) * px, y0 + (p[1] + 0.5) * px];
        const o = b.owner[k]!;
        if (o === -2) drawBalloon(g, cx, cy, px, (4 * (b.landAt - t)) / BALLOON_WARN_TICKS, t);
        else if (t - b.landAt < SHOW_TICKS)
          drawBalloonSplash(g, cx, cy, px, o >= 0 ? TEAM_COLOR[o]! : 0x888888, o < 0, (t - b.landAt) / SHOW_TICKS);
      });
  if (a?.kind === 'blackout') {
    const fade = Math.min(1, (t - a.start + 1) / FADE_TICKS, (a.end - t) / FADE_TICKS);
    const lights = s.grid.bodies.map((body): Px => [x0 + (body.x * px) / 16, y0 + (body.y * px) / 16]);
    drawBlackout(dark, x0, y0, px, MAP_W, MAP_H, lights, BLACKOUT_LIGHT, Math.max(0, fade), clear ?? undefined);
  }
}
