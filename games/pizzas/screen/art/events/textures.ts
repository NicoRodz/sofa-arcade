// The mid-round events, drawn (midround.ts is the rules): the big banner that announces the event 3 s before (icon, name, what it does, a countdown), the little pill under the
// clock while it lasts, and what each one looks like: the rush (red edges, bells), the inspector (his pill counts the dirty plates, a stamp at the windows when he leaves),
// the blackout (the kitchen goes dark, a crossed-out bolt over every oven), the birthday (balloons and confetti; the order's ticket is in hud.ts) and the rat (a little
// grey rat that runs across the floor, grabs an item and is scared off by a dash). Everything is drawn by code. Only exists when `game.mid` does.
import type Phaser from 'phaser';
import type { EventKind } from '../../../sim/midround';
import { C, circle, drawOutlined, makeTex, vgrad } from '@pichi/screen-kit/art';
import { badge, GLYPH } from './glyphs';

export function buildEventTextures(scene: Phaser.Scene) {
  for (const kind of Object.keys(GLYPH) as EventKind[])
    makeTex(scene, `ev_${kind}`, { w: 120, h: 120 }, (c) => {
      badge(c, kind);
      GLYPH[kind](c);
    });
  // the oven's "no power" sign: a bolt with a red slash (white outline so it reads over the dark)
  makeTex(scene, 'ev_nopower', { w: 60, h: 60 }, (c) => {
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(6, -24);
        c.lineTo(-10, 4);
        c.lineTo(0, 4);
        c.lineTo(-4, 24);
        c.lineTo(12, -6);
        c.lineTo(2, -6);
        c.closePath();
      },
      C.cheese,
      { lw: 3, stroke: '#fff' },
    );
    c.strokeStyle = C.ink;
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(-22, 22);
    c.lineTo(22, -22);
    c.stroke();
    c.strokeStyle = C.danger;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-22, 22);
    c.lineTo(22, -22);
    c.stroke();
  });
  // the rat itself, facing right, feet at the origin: body, belly, head with a long snout, ear, eye, tail
  makeTex(scene, 'rat', { w: 110, h: 64, ox: 50, oy: 52 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(4, 2, 30, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = C.ink;
    c.lineWidth = 8;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-26, -14);
    c.bezierCurveTo(-48, -18, -44, -42, -60, -34);
    c.stroke();
    c.strokeStyle = '#F2A5B5';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-26, -14);
    c.bezierCurveTo(-48, -18, -44, -42, -60, -34);
    c.stroke();
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.ellipse(-4, -16, 30, 17, 0, 0, Math.PI * 2);
      },
      vgrad(c, -34, 0, '#B9B6C6', '#8C899C'),
      { lw: 3.2 },
    );
    c.fillStyle = '#D9D6E2';
    c.beginPath();
    c.ellipse(0, -9, 20, 8, 0, 0, Math.PI * 2);
    c.fill();
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(16, -26);
        c.bezierCurveTo(26, -34, 40, -26, 50, -16);
        c.bezierCurveTo(40, -8, 26, -6, 16, -8);
        c.closePath();
      },
      '#B9B6C6',
      { lw: 3.2 },
    );
    drawOutlined(c, circle(c, 51, -16, 4), '#F2A5B5', { lw: 2.2 });
    drawOutlined(c, circle(c, 20, -34, 8), '#B9B6C6', { lw: 2.8 });
    c.fillStyle = '#F2A5B5';
    c.beginPath();
    c.arc(20, -34, 4.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = C.ink;
    c.beginPath();
    c.arc(33, -22, 2.8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(34, -23, 1, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = C.ink;
    c.lineWidth = 1.4;
    for (const dy of [-3, 1]) {
      c.beginPath();
      c.moveTo(46, -16 + dy);
      c.lineTo(58, -18 + dy * 2);
      c.stroke();
    }
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.ellipse(-14, -2, 5, 3, 0, 0, Math.PI * 2);
      },
      '#F2A5B5',
      { lw: 2 },
    );
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.ellipse(14, -2, 5, 3, 0, 0, Math.PI * 2);
      },
      '#F2A5B5',
      { lw: 2 },
    );
  });
  makeTex(scene, 'balloon', { w: 56, h: 100, ox: 28, oy: 36 }, (c) => {
    c.strokeStyle = 'rgba(43,27,23,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 22);
    c.bezierCurveTo(6, 40, -6, 52, 0, 62);
    c.stroke();
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(0, 22);
        c.bezierCurveTo(-30, 8, -26, -34, 0, -36);
        c.bezierCurveTo(26, -34, 30, 8, 0, 22);
        c.closePath();
      },
      '#FFFFFF',
      { lw: 3 },
    );
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(0, 22);
        c.lineTo(-5, 30);
        c.lineTo(5, 30);
        c.closePath();
      },
      '#E0E0E0',
      { lw: 2 },
    );
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.ellipse(-10, -16, 5, 9, 0.4, 0, Math.PI * 2);
    c.fill();
  });
}
