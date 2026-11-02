// Team look, step 2 (canvas): bakes one figure into two textures of the rig's box (120x170, feet at (60,150)): the GARMENT in greys (it takes the team colour
// with a MULTIPLY tint) and the BODY (skin, face, hair, outlines, shoes: untinted). Painting runs op by op in z order; each run of same-layer ops is drawn on its own
// canvas and then composited into its layer while knocked out of the other one, so the two layers never overlap: a hat over a head over a shirt stays right
// whichever layer is drawn first, and the outline of a shirt sits over the shirt, not under it.
import type { Appearance } from '@pichi/core/avatar';
import { Canvas2DPainter } from '@pichi/core/avatar';
import { R } from '../gfx';
import { figureLayers, type Layer, type LookView } from './look-layers';
import { replay } from './look-ops';

export const LOOK_BOX = { w: 120, h: 170, ox: 60, oy: 150 };

export interface TeamLayers {
  garment: HTMLCanvasElement;
  body: HTMLCanvasElement;
}

function blank(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(LOOK_BOX.w * R);
  cv.height = Math.ceil(LOOK_BOX.h * R);
  return cv;
}

/** Bakes the two layers of a look as seen from `view`, for the game `role` ('arena' keeps the player's own hat and no apron). */
export function bakeTeamLayers(ap: Appearance, view: LookView, role: string): TeamLayers {
  const { ops, layer, grey } = figureLayers(ap, view, role);
  const out: Record<Layer, HTMLCanvasElement> = { garment: blank(), body: blank() };
  // runs of consecutive paint ops of one layer
  const runs: { layer: Layer; from: number; to: number }[] = [];
  layer.forEach((l, i) => {
    if (!l) return;
    const last = runs[runs.length - 1];
    if (last && last.layer === l) last.to = i;
    else runs.push({ layer: l, from: i, to: i });
  });
  for (const run of runs) {
    const t = blank();
    const c = t.getContext('2d')!;
    c.setTransform(R, 0, 0, R, LOOK_BOX.ox * R, LOOK_BOX.oy * R);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    replay(ops, new Canvas2DPainter(c), (i, op) => (i < run.from || i > run.to ? null : (grey[i] ?? op.color)));
    const [into, from] = run.layer === 'garment' ? [out.garment, out.body] : [out.body, out.garment];
    into.getContext('2d')!.drawImage(t, 0, 0);
    const k = from.getContext('2d')!;
    k.globalCompositeOperation = 'destination-out';
    k.drawImage(t, 0, 0);
    k.globalCompositeOperation = 'source-over';
  }
  return out;
}
