// Glasses (plan §2): 1 round rims, 2 sunglasses, 3 party stars. They sit on the eyes (x = +-7, y = -70) and never go in the back view.
// Round and party leave the eyes visible; sunglasses are tinted at alpha 0.72 so the eyes still read through.
import type { Painter } from '../painter';
import type { DrawCtx } from './ctx';
import { INK, TAU, poly, rrect, star } from './kit';

const rim = (p: Painter, w: number, color: string) => {
  p.lineJoin = 'round';
  p.lineWidth = w;
  p.strokeStyle = color;
  p.stroke();
};

export function drawGlasses(p: Painter, c: DrawCtx): void {
  const side = c.view === 'side';
  const xs = side ? [c.hx + 9] : [-7.5, 7.5];
  if (c.ap.gl === 1) {
    for (const x of xs) {
      p.beginPath();
      p.arc(x, -70, side ? 8 : 7, 0, TAU);
      rim(p, 4, INK);
    }
    p.beginPath();
    if (side) p.moveTo(c.hx + 1, -70), p.lineTo(c.hx - 8, -69);
    else p.moveTo(-1, -71), p.lineTo(1, -71);
    rim(p, 3, INK);
  } else if (c.ap.gl === 2) {
    for (const x of xs) {
      rrect(p, x - 8, -76, 16, 11, 4.5);
      p.globalAlpha = 0.72;
      p.fillStyle = '#1B1B1F';
      p.fill();
      p.globalAlpha = 1;
      rim(p, 3, INK);
    }
    p.beginPath();
    p.moveTo(xs[0]! - 3, -66);
    p.lineTo(xs[0]! - 7, -69);
    p.lineWidth = 2;
    p.strokeStyle = '#FFFFFF';
    p.globalAlpha = 0.5;
    p.stroke();
    p.globalAlpha = 1;
    if (side) {
      p.beginPath();
      p.moveTo(c.hx + 1, -72);
      p.lineTo(c.hx - 8, -70);
      rim(p, 3, INK);
    }
  } else if (c.ap.gl === 3) {
    for (const x of xs) {
      poly(p, star(x, -70, 10.5, 5.2));
      rim(p, 7, INK);
      poly(p, star(x, -70, 10.5, 5.2));
      rim(p, 3, '#FFD23F');
    }
  }
}
