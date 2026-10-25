import { C } from '@pichi/screen-kit/art/tokens';
import { blob, circle, contactShadow, drawOutlined, rng, shine, star, vgrad, type Ctx } from '@pichi/screen-kit/art/gfx';

export function radial(c: Ctx, x: number, y: number, r: number, inner: string, outer: string) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  return g;
}

export function doughRaw(c: Ctx) {
  drawOutlined(c, () => blob(c, 0, 0, 22, 10, 2, 7), radial(c, 0, 0, 24, '#FFEFC8', C.dough), { lw: 2.5, shadow: [2, 22, 20, 5] });
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath();
  c.ellipse(-7, -8, 8, 5, -0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = C.dough2;
  c.beginPath();
  c.ellipse(8, 6, 7, 4.5, 0.4, 0, Math.PI * 2);
  c.fill();
  shine(c, 0, 0, 17, 0.5, 2.5);
}

export function doughStr(c: Ctx, withShadow = true) {
  drawOutlined(c, circle(c, 0, 0, 28), C.doughEdge, { lw: 2.5, shadow: withShadow ? [2, 26, 26, 6] : undefined });
  c.fillStyle = radial(c, 0, 0, 23, '#FFF1D0', C.dough2);
  c.beginPath();
  c.arc(0, 0, 22.5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(160,110,50,0.35)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(0, 0, 22.5, 0, Math.PI * 2);
  c.stroke();
  const rnd = rng(11);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc((rnd() - 0.5) * 34, (rnd() - 0.5) * 34, 1.6 + rnd() * 1.2, 0, Math.PI * 2);
    c.fill();
  }
  shine(c, 0, 0, 24, 0.5, 2.5);
}

export function tomato(c: Ctx) {
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.ellipse(0, 3, 20, 18, 0, 0, Math.PI * 2);
    },
    radial(c, 0, 2, 20, '#FF6A57', C.tomato2),
    { lw: 2.5, shadow: [2, 22, 18, 5] },
  );
  c.fillStyle = C.tomato;
  c.beginPath();
  c.ellipse(1, 5, 15, 12, 0, 0, Math.PI * 2);
  c.globalAlpha = 0.45;
  c.fill();
  c.globalAlpha = 1;
  // calyx
  drawOutlined(c, () => star(c, 0, -13, 10, 4.5, 5), C.basil, { lw: 2 });
  c.fillStyle = C.basil2;
  c.beginPath();
  c.arc(0, -13, 2.2, 0, Math.PI * 2);
  c.fill();
  shine(c, 0, 3, 14, 0.55, 3);
}

function slice(c: Ctx, x: number, y: number, r: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  drawOutlined(c, circle(c, 0, 0, r), C.tomato2, { lw: 2 });
  c.fillStyle = C.tomato;
  c.beginPath();
  c.arc(0, 0, r - 2.2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#FF7B6B';
  c.beginPath();
  c.arc(0, 0, r - 4.5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(181,40,31,0.45)';
  c.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * (r - 4.5), Math.sin(a) * (r - 4.5));
    c.stroke();
  }
  c.fillStyle = '#FFE3A0';
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    c.beginPath();
    c.ellipse(Math.cos(a) * 4.8, Math.sin(a) * 4.8, 1.7, 1.1, a, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

export function tomatoCut(c: Ctx) {
  contactShadow(c, 0, 22, 22, 5);
  slice(c, -10, 6, 12, 0.3);
  slice(c, 10, 8, 12, -0.4);
  slice(c, 0, -8, 13, 0.1);
}

// Cheese: a yellow wedge with holes (raw) and a mound of shreds (grated on the board).
export function cheeseRaw(c: Ctx) {
  contactShadow(c, 2, 20, 26, 5);
  const front = () => {
    c.beginPath();
    c.moveTo(-26, 14);
    c.lineTo(26, 14);
    c.lineTo(26, -4);
    c.closePath();
  };
  const top = () => {
    c.beginPath();
    c.moveTo(-26, 14);
    c.lineTo(26, -4);
    c.lineTo(26, -14);
    c.lineTo(-26, 4);
    c.closePath();
  };
  drawOutlined(c, top, '#FFE87A', { lw: 2.5 });
  drawOutlined(c, front, vgrad(c, -4, 14, '#FFD23F', C.cheese2), { lw: 2.5 });
  c.fillStyle = '#C98A1B';
  for (const [x, y, r] of [
    [8, 9, 2.6],
    [17, 5, 2],
    [-6, 11, 2.2],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#E3B22A';
  for (const [x, y, r] of [
    [2, -2, 2.4],
    [14, -8, 2],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, r, r * 0.7, -0.4, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-20, 7);
  c.lineTo(20, -7);
  c.stroke();
}

export function cheeseCut(c: Ctx) {
  contactShadow(c, 0, 18, 24, 5);
  // a loose pile of yellow shreds: every strand is an ink-outlined curve, back ones first
  const rnd = rng(41);
  const strands: [number, number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (0.05 + 0.9 * rnd()),
      r = Math.sqrt(rnd());
    strands.push([Math.cos(a) * 22 * r, 14 - Math.sin(a) * 18 * r, (rnd() - 0.5) * 2.4, rnd()]);
  }
  strands.sort((p, q) => p[1] - q[1]);
  c.lineCap = 'round';
  for (const pass of [0, 1])
    for (const [x, y, rot, t] of strands) {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.strokeStyle = pass === 0 ? C.ink : t > 0.6 ? '#FFF1A8' : t > 0.25 ? C.cheese : '#F2B33D';
      c.lineWidth = pass === 0 ? 4.6 : 2.4;
      c.beginPath();
      c.moveTo(-6, 0);
      c.quadraticCurveTo(0, -3.5 * (t > 0.5 ? 1 : -1), 6, 0);
      c.stroke();
      c.restore();
    }
}
