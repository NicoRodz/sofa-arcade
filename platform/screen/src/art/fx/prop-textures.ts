// Generated particle/prop textures and the juice manager (particles, floating numbers, shake).
import type Phaser from 'phaser';
import { C } from '../tokens';
import { circle, drawOutlined, makeTex, rr, vgrad } from '../gfx';

export function buildPropTextures(scene: Phaser.Scene) {
  // sabotage: the aiming reticle (a ring with four ticks and a dot, white so it can be tinted with the thrower's colour) and the soft shadow that warns where the bag lands
  makeTex(scene, 'sab_reticle', { w: 120, h: 120 }, (c) => {
    c.strokeStyle = C.ink;
    c.lineWidth = 11;
    c.beginPath();
    c.arc(0, 0, 40, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#fff';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(0, 0, 40, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      c.save();
      c.rotate((i * Math.PI) / 2);
      c.strokeStyle = C.ink;
      c.lineWidth = 11;
      c.beginPath();
      c.moveTo(24, 0);
      c.lineTo(56, 0);
      c.stroke();
      c.strokeStyle = '#fff';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(25, 0);
      c.lineTo(55, 0);
      c.stroke();
      c.restore();
    }
    c.fillStyle = C.ink;
    c.beginPath();
    c.arc(0, 0, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(0, 0, 5.5, 0, Math.PI * 2);
    c.fill();
  });
  makeTex(scene, 'sab_shadow', { w: 120, h: 120 }, (c) => {
    const g = c.createRadialGradient(0, 0, 4, 0, 0, 54);
    g.addColorStop(0, 'rgba(20,10,6,0.75)');
    g.addColorStop(0.65, 'rgba(20,10,6,0.45)');
    g.addColorStop(1, 'rgba(20,10,6,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 54, 0, Math.PI * 2);
    c.fill();
  });
  // the fire extinguisher (burn.ts): a red cylinder with a white band, a black valve, a hose that ends in a nozzle pointing right. Drawn upright with the nozzle at (30, -26).
  makeTex(scene, 'extinguisher', { w: 84, h: 100, ox: 36, oy: 50 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(0, 46, 20, 5, 0, 0, Math.PI * 2);
    c.fill();
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(6, -24);
        c.bezierCurveTo(22, -24, 26, -34, 32, -30);
        c.lineTo(38, -22);
        c.lineTo(32, -17);
        c.lineTo(28, -21);
        c.bezierCurveTo(22, -16, 14, -16, 6, -17);
        c.closePath();
      },
      '#2B2B33',
      { lw: 2.6 },
    ); // hose and nozzle
    drawOutlined(c, () => rr(c, -17, -28, 34, 76, 14), vgrad(c, -28, 48, '#F4533F', '#B5281F'), { lw: 3.2 });
    drawOutlined(c, () => rr(c, -17, -2, 34, 20, 2), '#FFF4E0', { lw: 2.4 }); // the label band
    c.fillStyle = C.tomato2;
    c.beginPath();
    c.moveTo(-5, 12);
    c.bezierCurveTo(-8, 5, 0, 3, 0, -1);
    c.bezierCurveTo(4, 4, 6, 8, 5, 12);
    c.bezierCurveTo(3, 16, -3, 16, -5, 12);
    c.fill(); // a flame on it
    drawOutlined(c, () => rr(c, -9, -38, 18, 14, 4), '#2B2B33', { lw: 2.6 }); // valve
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(-14, -42);
        c.lineTo(12, -42);
        c.lineTo(8, -35);
        c.lineTo(-10, -35);
        c.closePath();
      },
      '#7D8B95',
      { lw: 2.4 },
    ); // handle
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-10, -18);
    c.lineTo(-10, 36);
    c.stroke(); // highlight
  });
  makeTex(scene, 'knife', { w: 64, h: 24 }, (c) => {
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(-8, -7);
        c.lineTo(22, -6);
        c.quadraticCurveTo(30, -2, 26, 4);
        c.lineTo(-8, 5);
        c.closePath();
      },
      vgrad(c, -7, 5, '#F2F6F8', C.steel2),
      { lw: 2.2, shadow: [0, 9, 22, 3] },
    );
    drawOutlined(c, () => rr(c, -26, -6, 20, 11, 4), '#6B3F22', { lw: 2.2 });
    c.fillStyle = C.steel2;
    c.beginPath();
    c.arc(-21, -0.5, 1.2, 0, Math.PI * 2);
    c.arc(-13, -0.5, 1.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-2, -4);
    c.lineTo(20, -4);
    c.stroke();
  });
  makeTex(scene, 'bell', { w: 72, h: 64, oy: 52 }, (c) => {
    c.fillStyle = 'rgba(60,30,10,0.28)';
    c.beginPath();
    c.ellipse(0, 3, 32, 6, 0, 0, Math.PI * 2);
    c.fill();
    drawOutlined(c, () => rr(c, -30, -8, 60, 11, 5), vgrad(c, -8, 3, '#FFD86B', '#D9A21F'), { lw: 3 });
    const dome = () => {
      c.beginPath();
      c.moveTo(-25, -8);
      c.arc(0, -8, 25, Math.PI, 0);
      c.closePath();
    };
    drawOutlined(c, dome, vgrad(c, -33, -8, '#FFE58A', '#E3A81C'), { lw: 3 });
    drawOutlined(c, circle(c, 0, -37, 5), '#FFD23F', { lw: 2.5 });
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 3.5;
    c.beginPath();
    c.arc(0, -8, 19, Math.PI * 1.1, Math.PI * 1.45);
    c.stroke();
  });
  makeTex(scene, 'arrow', { w: 60, h: 56 }, (c) => {
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(-24, -9);
        c.lineTo(2, -9);
        c.lineTo(2, -21);
        c.lineTo(26, 0);
        c.lineTo(2, 21);
        c.lineTo(2, 9);
        c.lineTo(-24, 9);
        c.closePath();
      },
      vgrad(c, -21, 21, '#FF6A5A', C.tomato),
      { lw: 3.5 },
    );
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(-20, -6, 20, 3);
  });
}
