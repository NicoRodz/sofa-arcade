import { C } from '@pichi/screen-kit/art/tokens';
import { blob, contactShadow, drawOutlined, rng, shade, shine, type Ctx } from '@pichi/screen-kit/art/gfx';
import { pizzaDone, pizzaBurnt } from './pizza';

export function tray(c: Ctx) {
  // round peel: handle first so the disc covers its root
  drawOutlined(
    c,
    () => {
      c.beginPath();
      c.roundRect(-5, 20, 10, 22, 4);
    },
    C.wood2,
    { lw: 2.5 },
  );
  contactShadow(c, 2, 30, 30, 6);
  const g = c.createLinearGradient(-24, -28, 24, 28);
  g.addColorStop(0, '#E4ECF0');
  g.addColorStop(1, C.steel2);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 32, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = C.ink;
  c.stroke();
  c.strokeStyle = 'rgba(43,27,23,0.35)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(0, 0, 26, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = shade(C.steel, 0.35);
  c.beginPath();
  c.arc(0, 0, 25, 0, Math.PI * 2);
  c.fill();
  shine(c, 0, 0, 28, 0.6, 3);
}

// A used plate: the same tray with sauce smears, crumbs and a crust left behind.
export function trayDirty(c: Ctx) {
  tray(c);
  const rnd = rng(53);
  c.fillStyle = 'rgba(181,40,31,0.75)';
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.ellipse((rnd() - 0.5) * 30, (rnd() - 0.5) * 26, 5 + rnd() * 5, 3 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,200,60,0.85)';
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc((rnd() - 0.5) * 36, (rnd() - 0.5) * 32, 1.4 + rnd() * 1.4, 0, Math.PI * 2);
    c.fill();
  }
  drawOutlined(c, () => blob(c, 9, -8, 6, 6, 1.2, 9), C.crust, { lw: 1.8 });
}

export function dish(c: Ctx, cheese = false) {
  tray(c);
  c.save();
  c.scale(0.82, 0.82);
  pizzaDone(c, false, cheese);
  c.restore();
}

// A burnt pizza on its tray (what a chef carries to the bin).
export function dishBurnt(c: Ctx) {
  tray(c);
  c.save();
  c.scale(0.82, 0.82);
  pizzaBurnt(c, false);
  c.restore();
}
