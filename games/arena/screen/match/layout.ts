// Manchazo's screen layout (logical 1920x1080) as data, so the scene draws it and a test proves the HUD stays inside the title-safe area (90 %).
// Top: 150 px of HUD (two rows: each team's percentage on the left with what it took or used beside it, the clock on the right; then the floor bar); the 27x15 floor of 56 px tiles under it; a 36 px band at the bottom for the seed and the next event.
import { SAFE, W } from '@pichi/screen-kit/art';
import { MAP_H, MAP_W } from '../../map';

export const PX = 56; // logical px per tile (5 cm on a 78" screen)
export const X0 = (W - MAP_W * PX) / 2;
export const Y0 = 150; // under the HUD band
export const FLOOR_BOTTOM = Y0 + MAP_H * PX; // 990
export const HUD_TOP = SAFE.y; // the HUD's text starts at the top of the safe area
export const BAR_Y = 124; // floor bar, between the percentages and the floor (PR1: taller, so the tug of war reads from the couch)
export const BAR_H = 22;
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

export const PCT_SIZE = 40; // the percentages are stacked on the left, one per team row, so the strip beside them can carry the feed
export const ROW_H = 33; // a team row of the top band: 54..87 orange, 87..120 blue (the bar starts at 124)
export const CLOCK_SIZE = 56;
export const FOOT_SIZE = 28; // secondary text: the plan's minimum
export const FEED_X = X0 + 300; // the top feed starts after the percentage and its "+X %" ...
export const FEED_W = MAP_W * PX - 300 - 230; // ... and ends before the clock
export const FEED_SIZE = 28; // the plan's minimum for secondary text
export const POP_SIZE = 30; // the "+X %" right after each team's percentage
export const STRIP_H = 34; // the event banner lives in the bottom band, under the floor

/** Every HUD element's worst-case rectangle. The longest strings: "▲ 100.0 %" (9), "10:00" (5), "MAPA 3·ABCDEF" (13), "Próximo evento: Casillas doradas (105 s)" (40). */
export const HUD: Record<string, Rect> = {
  pct0: { ...textBox(SIDE_X, HUD_TOP, PCT_SIZE, 9, 0), h: ROW_H },
  pct1: { ...textBox(SIDE_X, HUD_TOP + ROW_H, PCT_SIZE, 9, 0), h: ROW_H },
  clock: textBox(X0 + MAP_W * PX, HUD_TOP, CLOCK_SIZE, 5, 1),
  bar: { x: X0, y: BAR_Y, w: MAP_W * PX, h: BAR_H },
  feed0: { x: FEED_X, y: HUD_TOP, w: FEED_W, h: ROW_H },
  feed1: { x: FEED_X, y: HUD_TOP + ROW_H, w: FEED_W, h: ROW_H },
  strip: { x: X0, y: FLOOR_BOTTOM + 2, w: MAP_W * PX, h: STRIP_H }, // the event banner (seed and next event step aside while it is up)
  seed: textBox(X0, BOTTOM_Y, FOOT_SIZE, 13, 0),
  next: textBox(X0 + MAP_W * PX, BOTTOM_Y, FOOT_SIZE, 40, 1),
};
