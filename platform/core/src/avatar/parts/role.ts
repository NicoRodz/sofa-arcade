// Role overlay (plan §3): the apron (Pizzas) and the climbing harness (Obstaculos). The role's head piece lives in hats.ts (chef, helmet).
import type { Painter } from '../painter';
import type { DrawCtx } from './ctx';
import { INK, ell, limb, paint, rrect } from './kit';

const WEBBING = '#5B4636';
export function drawOverlay(p: Painter, c: DrawCtx): void {
  const w = c.view === 'side' ? 11 : 17;
  if (c.role.overlay === 'apron') {
    if (c.view === 'back') {
      limb(p, -w, -28, w, -28, 3, '#F4F4F0');
      return;
    }
    const aw = c.view === 'side' ? 7 : 12;
    rrect(p, c.view === 'side' ? 2 : -aw, -38, aw * 2 - (c.view === 'side' ? 4 : 0), 25, 4);
    paint(p, '#F4F4F0');
    limb(p, -aw + 2, -38, -9, -49, 2.5, '#F4F4F0');
    limb(p, aw - 2, -38, 9, -49, 2.5, '#F4F4F0');
  } else if (c.role.overlay === 'harness') {
    limb(p, -w + 3, -48, w - 3, -18, 4, WEBBING);
    limb(p, w - 3, -48, -w + 3, -18, 4, WEBBING);
    if (c.view !== 'back') {
      rrect(p, -4, -35, 8, 8, 2);
      paint(p, '#C9CED6');
      ell(p, 0, -31, 1.4, 1.4);
      p.fillStyle = INK;
      p.fill();
    }
  }
}
