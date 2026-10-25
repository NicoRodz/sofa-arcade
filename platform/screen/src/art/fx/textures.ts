// Generated particle/prop textures and the juice manager (particles, floating numbers, shake).
import type Phaser from 'phaser';
import { C } from '../tokens';
import { circle, drawOutlined, makeTex, rr, star, vgrad } from '../gfx';
import { buildPropTextures } from './prop-textures';

function buildParticleTextures(scene: Phaser.Scene) {
  makeTex(scene, 'fx_dot', { w: 12, h: 12 }, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(0, 0, 4, 0, Math.PI * 2);
    c.fill();
  });
  makeTex(scene, 'fx_flour', { w: 10, h: 10 }, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(0, 0, 3, 0, Math.PI * 2);
    c.fill();
  });
  makeTex(scene, 'fx_star', { w: 30, h: 30 }, (c) => {
    drawOutlined(c, () => star(c, 0, 0, 12, 5.2), C.cheese, { lw: 2.5 });
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath();
    c.arc(-3, -3, 2, 0, Math.PI * 2);
    c.fill();
  });
  makeTex(scene, 'fx_smoke', { w: 40, h: 40 }, (c) => {
    const g = c.createRadialGradient(0, 0, 1, 0, 0, 14);
    g.addColorStop(0, 'rgba(200,192,184,0.95)');
    g.addColorStop(0.7, 'rgba(190,182,174,0.55)');
    g.addColorStop(1, 'rgba(190,182,174,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
  });
  makeTex(scene, 'fx_confetti', { w: 12, h: 14 }, (c) => {
    c.fillStyle = '#fff';
    rr(c, -3, -5, 6, 10, 1);
    c.fill();
  });
  makeTex(scene, 'fx_ring', { w: 72, h: 72 }, (c) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(0, 0, 30, 0, Math.PI * 2);
    c.stroke();
  });
  makeTex(scene, 'fx_glow', { w: 80, h: 80 }, (c) => {
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 38);
    g.addColorStop(0, 'rgba(255,200,80,0.85)');
    g.addColorStop(0.5, 'rgba(255,120,30,0.35)');
    g.addColorStop(1, 'rgba(255,90,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 38, 0, Math.PI * 2);
    c.fill();
  });
  for (const [i, h] of [
    [0, 30],
    [1, 38],
    [2, 26],
  ] as const) {
    makeTex(scene, `flame_${i}`, { w: 30, h: 46, ox: 15, oy: 44 }, (c) => {
      const f = (s: number, col: string) => {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, 0);
        c.bezierCurveTo(-12 * s, -4 * s, -10 * s, -h * 0.55 * s, -2 * s, -h * s);
        c.bezierCurveTo(0 * s, -h * 0.6 * s, 10 * s, -h * 0.55 * s, 12 * s, -4 * s);
        c.bezierCurveTo(9 * s, 2 * s, -9 * s, 2 * s, 0, 0);
        c.closePath();
        c.fill();
      };
      f(1, C.fire);
      f(0.66, C.fire2);
      f(0.34, '#FFF3B0');
      c.strokeStyle = 'rgba(120,30,0,0.5)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-12, -4, -10, -h * 0.55, -2, -h);
      c.bezierCurveTo(0, -h * 0.6, 10, -h * 0.55, 12, -4);
      c.stroke();
    });
  }
}

function buildUiTextures(scene: Phaser.Scene) {
  makeTex(scene, 'bar_bg', { w: 70, h: 18 }, (c) => {
    rr(c, -33, -7, 66, 14, 7);
    c.fillStyle = C.ink;
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.12)';
    rr(c, -30, -5, 60, 3, 1.5);
    c.fill();
  });
  makeTex(scene, 'bar_fill', { w: 64, h: 12, ox: 0, oy: 6 }, (c) => {
    rr(c, 0, -4, 60, 8, 4);
    c.fillStyle = vgrad(c, -4, 4, '#FFFFFF', '#BFBFBF');
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    rr(c, 3, -3, 54, 2.4, 1.2);
    c.fill();
  });
  makeTex(scene, 'coin', { w: 96, h: 96 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(2, 6, 42, 42, 0, 0, Math.PI * 2);
    c.fill();
    drawOutlined(c, circle(c, 0, 0, 40), vgrad(c, -40, 40, '#FFE46A', C.cheese2), { lw: 5 });
    c.strokeStyle = 'rgba(160,100,0,0.55)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 32, 0, Math.PI * 2);
    c.stroke();
    drawOutlined(c, () => star(c, 0, 1, 21, 9), '#FFF6C2', { lw: 3.5 });
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, 35, Math.PI * 1.1, Math.PI * 1.4);
    c.stroke();
  });
  makeTex(scene, 'clock_bg', { w: 112, h: 112 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, 7, 50, 50, 0, 0, Math.PI * 2);
    c.fill();
    drawOutlined(c, circle(c, 0, 0, 48), vgrad(c, -48, 48, '#FFFBF0', '#F1E3C6'), { lw: 5 });
  });
  makeTex(scene, 'panel_score', { w: 340, h: 92, ox: 0, oy: 46 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    rr(c, 4, -36, 316, 80, 40);
    c.fill();
    drawOutlined(c, () => rr(c, 2, -40, 316, 80, 40), vgrad(c, -40, 40, '#FFF8E6', '#F1E0BF'), { lw: 5 });
  });
  makeTex(scene, 'ticket_bg', { w: 140, h: 104, ox: 70, oy: 0 }, (c) => {
    const w = 128,
      h = 90,
      x0 = -w / 2;
    const path = () => {
      c.beginPath();
      c.moveTo(x0 + 10, 0);
      c.lineTo(x0 + w - 10, 0);
      c.quadraticCurveTo(x0 + w, 0, x0 + w, 10);
      c.lineTo(x0 + w, h - 6);
      const n = 8,
        sw = w / n;
      for (let i = 0; i < n; i++) {
        const xr = x0 + w - i * sw;
        c.lineTo(xr - sw / 2, h + 4);
        c.lineTo(xr - sw, h - 6);
      }
      c.lineTo(x0, 10);
      c.quadraticCurveTo(x0, 0, x0 + 10, 0);
      c.closePath();
    };
    c.save();
    c.translate(2, 6);
    path();
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fill();
    c.restore();
    drawOutlined(c, path, vgrad(c, 0, h, '#FFF9EA', '#F6E8CB'), { lw: 3.5 });
    c.fillStyle = 'rgba(255,255,255,0.65)';
    rr(c, x0 + 8, 3, w - 16, 3, 1.5);
    c.fill();
  });
}

export function buildFxTextures(scene: Phaser.Scene) {
  buildParticleTextures(scene);
  buildPropTextures(scene);
  buildUiTextures(scene);
}
