// The event banner as a strip in the bottom band, under the floor (never over the board): "CASILLAS DORADAS  La zona dorada vale x2 durante 15 s" on one line, semi-transparent,
// full for STRIP_FULL_TICKS and then it shrinks and fades. Pure geometry: the scene measures the two texts and draws what this returns; `event-strip.test.ts` reads it.
import { HUD } from '../layout';

export const STRIP_FULL_TICKS = 90; // 1.5 s at full size ...
export const STRIP_SHRINK_TICKS = 14; // ... then it shrinks and fades over this long
export const STRIP_ALPHA = 0.7; // the fill: the floor's frame shows through
const PAD = 22;
const GAP = 22; // between the title and the subtitle

export interface Strip {
  alpha: number; // 0..1 of everything drawn
  scale: number; // of the content, 1 at full size
  x: number; // left of the pill
  w: number;
  y: number;
  h: number;
  titleX: number; // left of the title (its origin is the left edge); the subtitle follows at `subX`
  subX: number;
}

/** The strip `age` ticks after the announcement for a title and subtitle of the given unscaled widths; null once it has gone. */
export function eventStrip(age: number, titleW: number, subW: number): Strip | null {
  if (age < 0 || age >= STRIP_FULL_TICKS + STRIP_SHRINK_TICKS) return null;
  const box = HUD.strip!;
  const natural = titleW + GAP + subW + 2 * PAD;
  const fit = Math.min(1, box.w / natural); // a long subtitle shrinks the whole line, never overflows
  const k = Math.max(0, (age - STRIP_FULL_TICKS) / STRIP_SHRINK_TICKS);
  const scale = fit * (1 - 0.4 * k);
  const w = natural * scale;
  const x = box.x + (box.w - w) / 2;
  return {
    alpha: 1 - k,
    scale,
    x,
    w,
    y: box.y,
    h: box.h,
    titleX: x + PAD * scale,
    subX: x + (PAD + titleW + GAP) * scale,
  };
}
