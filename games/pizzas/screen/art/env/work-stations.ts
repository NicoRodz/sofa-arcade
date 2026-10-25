import { C } from '@pichi/screen-kit/art/tokens';
import { circle, drawOutlined, rng, rr, vgrad, type Ctx } from '@pichi/screen-kit/art/gfx';
import { RAW_KIND, drawFood, ingredientColor } from '../food';
import { seed } from './tiles';

export function crate(c: Ctx, x0: number, y0: number, type: number) {
  const col = ingredientColor(type);
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath();
  c.ellipse(60, 112, 50, 7, 0, 0, Math.PI * 2);
  c.fill();
  // body
  drawOutlined(c, () => rr(c, 8, 26, 104, 86, 10), vgrad(c, 26, 112, '#B0763D', C.wood2), { lw: 3 });
  // dark interior
  c.fillStyle = '#4A2E1C';
  rr(c, 16, 32, 88, 36, 6);
  c.fill();
  // contents behind the front panel
  c.save();
  rr(c, 8, 0, 104, 76, 0);
  c.clip();
  c.save();
  c.translate(32, 54);
  c.scale(0.8, 0.8);
  drawFood(c, RAW_KIND[type]!);
  c.restore();
  c.save();
  c.translate(88, 54);
  c.scale(0.8, 0.8);
  drawFood(c, RAW_KIND[type]!);
  c.restore();
  c.save();
  c.translate(60, 48);
  c.scale(1.3, 1.3);
  drawFood(c, RAW_KIND[type]!);
  c.restore();
  c.restore();
  // front panel with slats
  drawOutlined(c, () => rr(c, 8, 62, 104, 50, 8), vgrad(c, 62, 112, '#C98A4B', C.wood2), { lw: 3 });
  c.strokeStyle = 'rgba(60,30,10,0.32)';
  c.lineWidth = 2.5;
  for (const y of [78, 96]) {
    c.beginPath();
    c.moveTo(14, y);
    c.lineTo(106, y);
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(14, 66, 92, 3);
  // label
  drawOutlined(c, () => rr(c, 26, 80, 68, 24, 8), col, { lw: 2.5 });
  c.fillStyle = type === 1 || type === 3 ? C.cream : C.ink;
  const name = ['MASA', 'TOMATE', 'QUESO', 'PEPPERONI', 'CHAMPIÑÓN'][type]!;
  c.font = `800 ${name.length > 6 ? 11 : 15}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(name, 60, 93);
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.beginPath();
  c.arc(31, 86, 1.8, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function board(c: Ctx, x0: number, y0: number, tx: number, ty: number) {
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)';
  rr(c, 14, 22, 96, 72, 12);
  c.fill();
  drawOutlined(c, () => rr(c, 12, 14, 96, 72, 12), vgrad(c, 14, 86, '#F2CB96', '#E0AE70'), { lw: 2.5 });
  c.strokeStyle = 'rgba(140,90,40,0.25)';
  c.lineWidth = 2;
  const rnd = rng(seed(tx, ty) + 9);
  for (let i = 0; i < 4; i++) {
    const y = 26 + i * 15 + rnd() * 3;
    c.beginPath();
    c.moveTo(22, y);
    c.quadraticCurveTo(50, y - 4, 70 + rnd() * 20, y + 1);
    c.stroke();
  }
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.ellipse(96, 24, 4.5, 3, 0, 0, Math.PI * 2);
    },
    '#9C6232',
    { lw: 1.8 },
  );
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(18, 18, 50, 3);
  c.fillStyle = 'rgba(120,70,30,0.35)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(24 + rnd() * 66, 62 + rnd() * 18, 1.4 + rnd(), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

export function oven(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.ellipse(60, 114, 54, 7, 0, 0, Math.PI * 2);
  c.fill();
  // chimney
  drawOutlined(c, () => rr(c, 76, -14, 26, 52, 4), vgrad(c, -14, 38, '#8C3F2E', C.brick2), { lw: 3 });
  drawOutlined(c, () => rr(c, 72, -20, 34, 12, 4), '#5E2A20', { lw: 3 });
  // dome body
  const body = () => {
    c.beginPath();
    c.moveTo(6, 114);
    c.lineTo(6, 62);
    c.arc(60, 62, 54, Math.PI, 0);
    c.lineTo(114, 114);
    c.closePath();
  };
  drawOutlined(c, body, vgrad(c, 8, 114, '#CC6048', C.brick2), { lw: 3.5 });
  c.save();
  body();
  c.clip();
  c.strokeStyle = 'rgba(60,15,10,0.38)';
  c.lineWidth = 2;
  for (let r = 0; r < 8; r++) {
    const y = 14 + r * 14;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(120, y);
    c.stroke();
    for (let x = (r % 2) * 18; x < 120; x += 36) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 14);
      c.stroke();
    }
  }
  c.fillStyle = 'rgba(255,255,255,0.1)';
  c.beginPath();
  c.ellipse(34, 40, 22, 10, -0.6, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // mouth
  const mouth = () => {
    c.beginPath();
    c.moveTo(30, 108);
    c.lineTo(30, 80);
    c.arc(60, 80, 30, Math.PI, 0);
    c.lineTo(90, 108);
    c.closePath();
  };
  drawOutlined(c, mouth, '#E8C9A0', { lw: 3 });
  c.save();
  c.translate(0, 3);
  c.scale(1, 1);
  c.beginPath();
  c.moveTo(35, 106);
  c.lineTo(35, 80);
  c.arc(60, 80, 25, Math.PI, 0);
  c.lineTo(85, 106);
  c.closePath();
  c.fillStyle = vgrad(c, 55, 106, '#1B0F0B', '#4A1F12');
  c.fill();
  c.strokeStyle = C.ink;
  c.lineWidth = 2.5;
  c.stroke();
  c.restore();
  // ledge
  drawOutlined(c, () => rr(c, 24, 104, 72, 12, 5), vgrad(c, 104, 116, '#B7803F', C.wood2), { lw: 2.5 });
  c.restore();
}

export function plates(c: Ctx, x0: number, y0: number) {
  c.save();
  c.translate(x0, y0);
  c.fillStyle = 'rgba(60,30,10,0.25)';
  c.beginPath();
  c.ellipse(60, 90, 40, 9, 0, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 4; i++) {
    c.save();
    c.translate(60, 70 - i * 6);
    c.scale(0.95, 0.95);
    drawOutlined(c, circle(c, 0, 0, 32), vgrad(c, -32, 32, '#EEF3F6', C.steel2), { lw: 2.5 });
    c.fillStyle = vgrad(c, -26, 26, '#F8FBFC', C.steel);
    c.beginPath();
    c.arc(0, 0, 25, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(43,27,23,0.3)';
    c.lineWidth = 1.5;
    c.stroke();
    c.restore();
  }
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(60, 46, 24, Math.PI * 1.1, Math.PI * 1.5);
  c.stroke();
  c.restore();
}
