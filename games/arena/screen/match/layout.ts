// Manchazo's screen layout (logical 1920x1080) as data, so the scene draws it and a test proves the HUD stays inside the title-safe area (90 %).
// Top: 150 px of HUD (percentages, clock, floor bar); the 27x15 floor of 56 px tiles under it; a 36 px band at the bottom for the seed and the next event.
import { SAFE, W } from '@pichi/screen-kit/art';
import { MAP_H, MAP_W } from '../../map';

export const PX = 56; // logical px per tile (5 cm on a 78" screen)
export const X0 = (W - MAP_W * PX) / 2;
export const Y0 = 150; // under the HUD band
export const FLOOR_BOTTOM = Y0 + MAP_H * PX; // 990
export const HUD_TOP = SAFE.y; // the HUD's text starts at the top of the safe area
export const BAR_Y = 130; // floor bar, between the percentages and the floor
export const BAR_H = 16;
export const BOTTOM_Y = FLOOR_BOTTOM + 1; // seed and next event
export const SIDE_X = X0; // the percentages sit over the floor's edges

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const LINE = 1.25; // a text line is at most this many font sizes tall
const GLYPH = 0.7; // a glyph is at most this many font sizes wide (bold sans / monospace, digits and symbols)

/** The box of a text of `chars` characters at `size` px, anchored at (x, y) by `ox` (0 left, 0.5 centre, 1 right). A bound, not a measurement. */
export const textBox = (x: number, y: number, size: number, chars: number, ox: 0 | 0.5 | 1): Rect => ({
  x: x - chars * size * GLYPH * ox,
  y,
  w: chars * size * GLYPH,
  h: size * LINE,
});

export const PCT_SIZE = 56;
export const CLOCK_SIZE = 56;
export const FOOT_SIZE = 28; // secondary text: the plan's minimum

/** Every HUD element's worst-case rectangle. The longest strings: "▲ 100 %" (7), "10:00" (5), "MAPA 3·ABCDEF" (13), "Próximo evento: Casillas doradas (105 s)" (40). */
export const HUD: Record<string, Rect> = {
  pctLeft: textBox(SIDE_X, HUD_TOP, PCT_SIZE, 7, 0),
  pctRight: textBox(SIDE_X + MAP_W * PX, HUD_TOP, PCT_SIZE, 7, 1),
  clock: textBox(W / 2, HUD_TOP, CLOCK_SIZE, 5, 0.5),
  bar: { x: X0, y: BAR_Y, w: MAP_W * PX, h: BAR_H },
  seed: textBox(X0, BOTTOM_Y, FOOT_SIZE, 13, 0),
  next: textBox(X0 + MAP_W * PX, BOTTOM_Y, FOOT_SIZE, 40, 1),
};
