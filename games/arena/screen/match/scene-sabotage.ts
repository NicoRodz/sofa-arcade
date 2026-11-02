// Manchazo's scene, sabotage layer (F3): pickups on the floor, the card each body carries, the pinata marks (turpentine, glue), the roller, the fan's gust.
// Each card has its own colour AND shape, so it reads without colour. No logic: it reads the sim's state.
import type Phaser from 'phaser';
import { CARD_COLOR, drawIcon } from '../art/glyphs';
import { FAN_FX_TICKS, FAN_RANGE, ROLLER_TICKS, cardOf, type ManchazoState, type Pickup, type SabotageKind } from '../../sim';

export interface Frame {
  g: Phaser.GameObjects.Graphics;
  x0: number;
  y0: number;
  px: number;
}

/** The card's icon centred on (cx, cy), r = half its size (the art is in ../art/glyphs.ts). */
export function glyph({ g }: Frame, kind: SabotageKind, cx: number, cy: number, r: number, spin = 0) {
  drawIcon(g, kind, cx, cy, r, spin);
}

const centre = (f: Frame, x: number, y: number): [number, number] => [f.x0 + x * f.px + f.px / 2, f.y0 + y * f.px + f.px / 2];

export function drawPickups(f: Frame, s: ManchazoState) {
  const a = s.match.sab;
  if (!a) return;
  a.pickups.forEach((p: Pickup, k) => {
    const [cx, cy] = centre(f, p.x, p.y);
    if (p.wait > 0) return void f.g.lineStyle(3, 0x8a7461, 0.35).strokeCircle(cx, cy, f.px * 0.28); // empty: it comes back // empty: it comes back
    const bob = Math.sin((s.grid.tick + k * 9) / 10) * 3;
    f.g.fillStyle(0x000000, 0.2).fillEllipse(cx, cy + f.px * 0.36, f.px * 0.5, f.px * 0.14); // the card hovers over its shadow
    glyph(f, cardOf(a, p), cx, cy + bob, f.px * 0.34, s.grid.tick / 6);
  });
}

/** Under a body: the roller's bar and speed lines, the footprints it leaves while tricked, its armed ring. Over it: the card in hand. */
export function drawCarrier(f: Frame, s: ManchazoState, i: number, x: number, y: number) {
  const a = s.match.sab;
  if (!a) return;
  const b = s.grid.bodies[i]!;
  if (a.roller[i]! > 0) {
    const sway = (a.roller[i]! % 8) * 2;
    f.g
      .fillStyle(CARD_COLOR.roller, 1)
      .fillRect(x - f.px * 0.5, y - f.px * 0.62, f.px, 9)
      .fillRect(x - f.px * 0.5, y + f.px * 0.52, f.px, 9);
    f.g.lineStyle(3, CARD_COLOR.roller, 0.8).lineBetween(x - f.px * 0.8 - sway, y, x - f.px * 0.45 - sway, y);
    f.g.lineStyle(4, CARD_COLOR.roller, 0.9).strokeCircle(x, y, f.px * 0.62 * (0.7 + a.roller[i]! / ROLLER_TICKS / 3));
  }
  if (a.footprints[b.team]! > 0)
    f.g
      .fillStyle(CARD_COLOR.footprints, 0.9)
      .fillEllipse(x - 8, y + f.px * 0.5, 9, 14)
      .fillEllipse(x + 8, y + f.px * 0.42, 9, 14);
  const armed = a.armed[i];
  if (armed) f.g.lineStyle(5, CARD_COLOR[armed], 0.5 + 0.5 * Math.sin(s.grid.tick / 5)).strokeCircle(x, y, f.px * 0.62);
  if (a.gust[i]! > 0) {
    const t = 1 - a.gust[i]! / FAN_FX_TICKS;
    f.g.lineStyle(8, CARD_COLOR.fan, 1 - t).strokeCircle(x, y, f.px * (0.5 + FAN_RANGE * t));
  }
  const held = a.held[i];
  if (held) glyph(f, held, x, y - f.px * 0.78, f.px * 0.28, s.grid.tick / 6);
}

/** A pinata armed by a card: turpentine is white-hot with a cyan ring, glue has a green rope to the rival it rides. */
export function drawMark(f: Frame, s: ManchazoState, p: ManchazoState['match']['pinatas'][number], cx: number, cy: number) {
  if (p.mod === 'turpentine')
    f.g
      .lineStyle(5, CARD_COLOR.turpentine, 1)
      .strokeCircle(cx, cy, f.px * 0.5)
      .fillStyle(0xffffff, 0.8)
      .fillCircle(cx, cy, f.px * 0.18);
  if (p.mod === 'glue' && p.stuck !== undefined) {
    const t = s.grid.bodies[p.stuck]!;
    f.g.lineStyle(4, CARD_COLOR.glue, 1).lineBetween(cx, cy, f.x0 + (t.x / 16) * f.px, f.y0 + (t.y / 16) * f.px);
    f.g.lineStyle(5, CARD_COLOR.glue, 1).strokeCircle(cx, cy, f.px * 0.5);
  }
}
