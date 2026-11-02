// Team look, step 1 (no DOM): which strokes of a figure are the GARMENT (the clothes, the hat, the cape: what takes the team colour) and which are not.
// The figure is drawn twice with the same parts: once as the player's look, once as a probe whose garment colours are all changed. A paint op whose colour
// differs between the two comes from the garment; one that does not (skin, hair, face, ink outlines, shoes, a button's own colour) is the body. This needs no
// list of colours, so a new part or a new shade() keeps working. Garment colours are then turned into greys (luminance 0.55 to 1.0) that Phaser multiplies
// by the team colour.
import type { Appearance } from '@pichi/core/avatar';
import { avatarParts } from '@pichi/core/avatar';
import { clothesSpec, makeCtx } from '@pichi/core/avatar/parts';
import { CommandPainter, type Op } from './look-ops';

export type LookView = 'front' | 'side' | 'back';
export type Layer = 'garment' | 'body';
export const GREY_MIN = 0.55;
export const GREY_MAX = 1;
const GREY_TOP = 0.8; // the main colour of the clothes
const GREY_SLOPE = 0.9;

/** Every channel moved by 128 (mod 256): any colour derived from the real one by shade() differs from the same one derived from this. */
const flip = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => (((n >> s) & 255) + 128) & 255;
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
};

/** The ctx of a figure, as the rig bakes it: the identity colour is white (a cape is then the lightest grey, tinted by the team). `probe` flips every garment colour. */
function ctxOf(ap: Appearance, view: LookView, role: string, probe: boolean): ReturnType<typeof makeCtx> {
  const c = makeCtx(ap, { view, t: 0, slotColor: '#ffffff', role });
  if (!probe) return c;
  const { top, bottom, accent } = c.clothes;
  return {
    ...c,
    slotColor: flip('#ffffff'),
    clothes: { ...c.clothes, top: flip(top), bottom: flip(bottom), accent: flip(accent) },
    hat: c.hat && { ...c.hat, color: flip(c.hat.color) },
  };
}

/** The whole figure (no ring: the game draws its own), every part in z order, as ops. */
export function recordFigure(ap: Appearance, view: LookView, role: string, probe = false): Op[] {
  const c = ctxOf(ap, view, role, probe);
  const p = new CommandPainter();
  for (const part of avatarParts(ap, view, role)) {
    if (part.id === 'ring') continue;
    p.save();
    part.draw(p, c);
    p.restore();
  }
  return p.ops;
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (hex: string): number => {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** The grey a garment colour becomes, relative to the main colour of the clothes (`top`): lighter stays up to 1.0, darker goes down to 0.55. */
export function greyOf(color: string, top: string): string {
  const g = Math.max(GREY_MIN, Math.min(GREY_MAX, GREY_TOP + GREY_SLOPE * (lum(color) - lum(top))));
  const h = Math.round(g * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${h}${h}${h}`;
}

export interface Split {
  /** Per op: the layer of each fill/stroke (undefined for state and path ops). */
  layer: (Layer | undefined)[];
  /** Per op: the grey of a garment fill/stroke. */
  grey: (string | undefined)[];
}

/** Splits a figure's paint ops into garment and body by comparing the real recording with the probe one. */
export function splitLayers(real: readonly Op[], probe: readonly Op[], top: string): Split {
  if (real.length !== probe.length) throw new Error(`team look: probe drew ${probe.length} ops, the look ${real.length}`);
  const layer: (Layer | undefined)[] = [];
  const grey: (string | undefined)[] = [];
  real.forEach((op, i) => {
    const other = probe[i]!;
    if (op.t !== 'paint' || other.t !== 'paint') {
      layer.push(undefined);
      grey.push(undefined);
      return;
    }
    const garment = op.color !== other.color;
    layer.push(garment ? 'garment' : 'body');
    grey.push(garment ? greyOf(op.color, top) : undefined);
  });
  return { layer, grey };
}

/** One call for a look: the ops of the figure and how each paint op splits. */
export function figureLayers(ap: Appearance, view: LookView, role: string): { ops: Op[] } & Split {
  const ops = recordFigure(ap, view, role);
  return { ops, ...splitLayers(ops, recordFigure(ap, view, role, true), clothesSpec(ap.cl).top) };
}
