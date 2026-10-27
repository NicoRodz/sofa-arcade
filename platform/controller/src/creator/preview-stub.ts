// Stand-in for core/avatar/draw.ts (F2 draws the real pieces). Same signature; when F2 lands, creator/creator.ts swaps this import for the real one.
// Draws an oval in the slot colour with the combination as base36 on it, so the preview, the thumbnails and the tests work today.
import { encodeAppearance, type Appearance, type Painter } from '@pichi/core';
import type { DrawOpts } from './preview';

type TextCtx = { fillText?: (s: string, x: number, y: number) => void; font?: string; textAlign?: string; fillStyle?: unknown };

export function drawAvatar(p: Painter, ap: Appearance, opts: DrawOpts): void {
  const dx = opts.view === 'side' ? 6 : 0;
  p.save();
  p.fillStyle = 'rgba(0,0,0,.25)';
  p.beginPath();
  p.ellipse(0, 0, 30, 8, 0, 0, Math.PI * 2);
  p.fill();
  p.fillStyle = opts.slotColor;
  p.strokeStyle = '#2B1B17';
  p.lineWidth = 4;
  p.beginPath();
  p.ellipse(dx, -62, 34, 60, 0, 0, Math.PI * 2);
  p.fill();
  p.stroke();
  if (opts.view !== 'back') {
    p.fillStyle = '#2B1B17';
    for (const ex of opts.view === 'side' ? [10] : [-9, 9]) {
      p.beginPath();
      p.arc(dx + ex, -86, 4, 0, Math.PI * 2);
      p.fill();
    }
  }
  const ctx = (p as unknown as { ctx?: TextCtx }).ctx; // only the Canvas 2D adapter can write text; Phaser would just skip the label
  if (ctx?.fillText) {
    ctx.fillStyle = '#FFF4E0';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(encodeAppearance(ap), dx, -52 + Math.sin(opts.t * 3) * 2);
  }
  p.restore();
}
