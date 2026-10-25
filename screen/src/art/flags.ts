// Team flags (Versus F4): a pennant on a pole, drawn procedurally in the game's outlined style. One drawing function for the in-game flag
// (a canvas texture refreshed every frame by the HUD) and for the results screen (a DOM canvas), so both show the same flag.
import { shade, type Ctx } from './gfx';
import { C } from './tokens';

/** wave: victory (full height, big ripple). droop: defeat (half mast, it hangs and barely moves). idle: a calm flag. */
export type FlagMood = 'wave' | 'droop' | 'idle';
export interface FlagSpec {
  color: string;
  glyph: string;
  mood: FlagMood;
  t: number;
} // t: seconds, drives the ripple
export const FLAG_W = 150,
  FLAG_H = 190; // design units of the drawing box; the pole base is at (14, FLAG_H - 6)

/** Draws the flag into a FLAG_W x FLAG_H box with the context origin at its top-left corner. */
export function drawFlag(c: Ctx, f: FlagSpec) {
  const wave = f.mood === 'wave',
    droop = f.mood === 'droop';
  const poleX = 16,
    base = FLAG_H - 6;
  const top = droop ? 70 : 8; // half mast when the team lost
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // base + pole
  c.fillStyle = 'rgba(43,27,23,0.25)';
  c.beginPath();
  c.ellipse(poleX, base + 2, 22, 6, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = C.ink;
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(poleX, base);
  c.lineTo(poleX, top);
  c.stroke();
  c.strokeStyle = C.wood;
  c.lineWidth = 4.5;
  c.beginPath();
  c.moveTo(poleX, base);
  c.lineTo(poleX, top);
  c.stroke();
  c.fillStyle = C.cheese2;
  c.strokeStyle = C.ink;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(poleX, top - 3, 6.5, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // pennant: a strip cut in columns, each one moved by the ripple; the tail has a swallow notch
  const len = FLAG_W - poleX - 8,
    ph = 74,
    y0 = top + 8,
    n = 14;
  const amp = wave ? 9 : droop ? 1.5 : 4;
  const speed = wave ? 6.5 : droop ? 1.6 : 3;
  const off = (u: number) => Math.sin(f.t * speed - u * 5.2) * amp * u + (droop ? u * u * 38 : 0); // droop: the tip falls
  const fill = droop ? shade(f.color, -0.18) : f.color;
  const topEdge = Array.from({ length: n + 1 }, (_v, i) => [poleX + (i / n) * len, y0 + off(i / n)] as const);
  const botEdge = Array.from(
    { length: n + 1 },
    (_v, i) => [poleX + (i / n) * len, y0 + ph + off(i / n) + (droop ? (i / n) * 10 : 0)] as const,
  );
  const notch = [poleX + len - 16, y0 + ph / 2 + off(0.9) + (droop ? 6 : 0)] as const;
  c.beginPath();
  topEdge.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.lineTo(notch[0], notch[1]);
  for (let i = n; i >= 0; i--) c.lineTo(botEdge[i]![0], botEdge[i]![1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = C.ink;
  c.lineWidth = 5;
  c.stroke();
  // light band along the top edge and the shade of the folds
  c.save();
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.beginPath();
  topEdge.forEach(([x, y], i) => (i ? c.lineTo(x, y + 9) : c.moveTo(x, y + 9)));
  for (let i = n; i >= 0; i--) c.lineTo(topEdge[i]![0], topEdge[i]![1]);
  c.closePath();
  c.fill();
  for (let i = 1; i < n; i += 2) {
    c.fillStyle = 'rgba(0,0,0,0.10)';
    const [x, y] = topEdge[i]!,
      [, by] = botEdge[i]!;
    c.fillRect(x, y, len / n, by - y);
  }
  c.restore();
  // the team glyph, white with an ink edge, riding the middle of the cloth
  const k = 0.42,
    gx = poleX + len * k,
    gy = y0 + ph / 2 + off(k) + (droop ? 4 : 0);
  c.font = '800 44px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 7;
  c.strokeStyle = C.ink;
  c.strokeText(f.glyph, gx, gy + 2);
  c.fillStyle = droop ? '#E6DCCB' : '#FFFFFF';
  c.fillText(f.glyph, gx, gy + 2);
}
