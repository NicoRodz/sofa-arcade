// Chef parts drawn on a canvas. Origin is the chef's feet; the head centre is (0, -68). Used for textures and DOM portraits.
import { HEAD_Y, MOUTH_DY } from '@pichi/core/avatar';
import { C, chefOf } from '../tokens';
import { circle, drawOutlined, ellipse, mix, rr, shade, vgrad } from '../gfx';
import type { Painter } from '@pichi/core/avatar';

export { HEAD_Y, MOUTH_DY };

const SHIRT_A = '#FFFFFF',
  SHIRT_B = '#E7DFD1';

export function skinGrad(c: Painter, skin: string) {
  const g = c.createRadialGradient(-8, HEAD_Y - 9, 3, 0, HEAD_Y, 26);
  g.addColorStop(0, shade(skin, 0.28));
  g.addColorStop(0.55, skin);
  g.addColorStop(1, shade(skin, -0.12));
  return g;
}

export function drawShadow(c: Painter) {
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 30);
  g.addColorStop(0, 'rgba(0,0,0,0.30)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, 0, 30, 10, 0, 0, Math.PI * 2);
  c.fill();
}

export function drawShoe(c: Painter) {
  drawOutlined(c, ellipse(c, 0, 0, 8, 5), '#3B2A22', { lw: 2.5 });
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.beginPath();
  c.ellipse(-2, -1.8, 3.5, 1.3, 0, 0, Math.PI * 2);
  c.fill();
}

/** `sleeve`: the player's clothes baked into the arm (creator §3, Pizzas rig): the shirt colour and how far it reaches. Absent = the chef's white coat. */
export interface Sleeve {
  color: string;
  kind: 'short' | 'long' | 'none';
}
export function drawArm(c: Painter, skin: string, sleeve?: Sleeve) {
  // anchor = shoulder; arm hangs down
  const kind = sleeve?.kind ?? 'short';
  drawOutlined(c, () => rr(c, -5, kind === 'none' ? -2 : 8, 10, kind === 'none' ? 28 : 18, 5), skinGrad2(c, skin), { lw: 2.5 });
  if (kind !== 'none')
    drawOutlined(
      c,
      () => rr(c, -6.5, -4, 13, kind === 'long' ? 28 : 17, 6),
      vgrad(c, -4, kind === 'long' ? 24 : 13, sleeve ? shade(sleeve.color, 0.12) : SHIRT_A, sleeve ? shade(sleeve.color, -0.1) : SHIRT_B),
      { lw: 2.5 },
    );
  drawOutlined(c, circle(c, 0, 27, 5.6), skin, { lw: 2.5 });
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath();
  c.ellipse(-1.6, 25.4, 1.8, 1.2, 0, 0, Math.PI * 2);
  c.fill();
}

function skinGrad2(c: Painter, skin: string) {
  const g = c.createLinearGradient(-5, 0, 5, 0);
  g.addColorStop(0, shade(skin, 0.15));
  g.addColorStop(1, shade(skin, -0.1));
  return g;
}

export function drawBody(c: Painter, slot: number) {
  const ch = chefOf(slot);
  drawOutlined(c, () => rr(c, -24, -49, 48, 46, 18), vgrad(c, -49, -3, SHIRT_A, SHIRT_B), { lw: 3 });
  // coat buttons peek out on both sides of the apron
  c.fillStyle = C.ink;
  for (const sx of [-1, 1])
    for (const y of [-42, -33, -24]) {
      c.beginPath();
      c.arc(sx * 20.5, y, 1.5, 0, Math.PI * 2);
      c.fill();
    }
  // apron
  c.strokeStyle = C.ink;
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(-9, -35);
  c.lineTo(-6, -47);
  c.moveTo(9, -35);
  c.lineTo(6, -47);
  c.stroke();
  c.strokeStyle = ch.dark;
  c.lineWidth = 3.6;
  c.stroke();
  drawOutlined(c, () => rr(c, -17, -35, 34, 31, 8), vgrad(c, -35, -4, ch.color, ch.dark), { lw: 3 });
  drawOutlined(c, () => rr(c, -8, -24, 16, 11, 3), mix(ch.dark, '#000000', 0.12), { lw: 2 });
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.beginPath();
  c.ellipse(-8, -31, 6, 2.2, -0.3, 0, Math.PI * 2);
  c.fill();
  if (ch.accessory === 'scarf') {
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(-15, -50);
        c.lineTo(15, -50);
        c.lineTo(0, -31);
        c.closePath();
      },
      vgrad(c, -50, -31, '#F0463A', '#C42D22'),
      { lw: 2.5 },
    );
    c.fillStyle = C.cream;
    for (const [x, y] of [
      [-7, -46],
      [6, -46],
      [0, -39],
    ] as const) {
      c.beginPath();
      c.arc(x, y, 1.8, 0, Math.PI * 2);
      c.fill();
    }
  }
}

export function drawBodyBack(c: Painter, slot: number) {
  const ch = chefOf(slot);
  drawOutlined(c, () => rr(c, -24, -49, 48, 46, 18), vgrad(c, -49, -3, SHIRT_A, SHIRT_B), { lw: 3 });
  c.strokeStyle = C.ink;
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(-17, -22);
  c.lineTo(17, -30);
  c.stroke();
  c.strokeStyle = ch.color;
  c.lineWidth = 3.6;
  c.stroke();
  // apron bow
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.moveTo(0, -26);
      c.lineTo(-11, -33);
      c.lineTo(-11, -19);
      c.closePath();
      c.moveTo(0, -26);
      c.lineTo(11, -33);
      c.lineTo(11, -19);
      c.closePath();
    },
    ch.color,
    { lw: 2.5 },
  );
  drawOutlined(c, circle(c, 0, -26, 3.4), ch.dark, { lw: 2 });
  if (ch.accessory === 'scarf') {
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(-14, -49);
        c.lineTo(14, -49);
        c.lineTo(0, -37);
        c.closePath();
      },
      '#E63B2E',
      { lw: 2.5 },
    );
  }
}
