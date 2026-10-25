import type { EventKind } from '../../../sim/midround';
import { C } from '@pichi/screen-kit/art/tokens';
import { circle, drawOutlined, rr, vgrad, type Ctx } from '@pichi/screen-kit/art/gfx';

/** Colour of each event: the banner, its pill and its badge. */
export const EVENT_COLOR: Record<EventKind, { main: string; dark: string }> = {
  rush: { main: '#E63B2E', dark: '#9E2118' },
  inspector: { main: '#3C7BC4', dark: '#254F85' },
  blackout: { main: '#3A4466', dark: '#1B2036' },
  birthday: { main: '#E95FA5', dark: '#A83572' },
  rat: { main: '#8A6B4C', dark: '#563F2A' },
  frost: { main: '#4FB6E0', dark: '#1F6E99' },
};

// --- Textures -----------------------------------------------------------------------------------------------------------------------------------------
export const badge = (c: Ctx, kind: EventKind) => {
  const col = EVENT_COLOR[kind];
  drawOutlined(c, circle(c, 0, 0, 50), vgrad(c, -50, 50, col.main, col.dark), { lw: 5, shadow: [2, 50, 44, 8] });
  c.strokeStyle = 'rgba(255,255,255,0.45)';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(0, 0, 42, Math.PI * 1.1, Math.PI * 1.45);
  c.stroke();
};

export const GLYPH: Record<EventKind, (c: Ctx) => void> = {
  rush: (c) => {
    // three tickets fanned out and a bolt over them
    for (const [x, y, a] of [
      [-16, 4, -0.35],
      [14, 4, 0.3],
      [0, -2, 0],
    ] as const) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      drawOutlined(c, () => rr(c, -15, -22, 30, 40, 4), '#FFF4E0', { lw: 3 });
      c.fillStyle = C.tomato;
      c.fillRect(-10, -14, 20, 4);
      c.fillStyle = '#C9BBA7';
      c.fillRect(-10, -6, 20, 3);
      c.fillRect(-10, 0, 14, 3);
      c.restore();
    }
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(6, -34);
        c.lineTo(-8, 4);
        c.lineTo(2, 4);
        c.lineTo(-4, 30);
        c.lineTo(14, -8);
        c.lineTo(4, -8);
        c.closePath();
      },
      C.cheese,
      { lw: 3.2 },
    );
  },
  inspector: (c) => {
    // a clipboard with a tick and a magnifying glass
    drawOutlined(c, () => rr(c, -22, -30, 40, 54, 5), '#B07B45', { lw: 3.2 });
    drawOutlined(c, () => rr(c, -17, -22, 30, 42, 3), '#FFF4E0', { lw: 2.4 });
    drawOutlined(c, () => rr(c, -10, -34, 16, 10, 3), '#B8C4CC', { lw: 2.4 });
    c.strokeStyle = C.basil;
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-11, -4);
    c.lineTo(-5, 3);
    c.lineTo(8, -12);
    c.stroke();
    c.strokeStyle = '#C9BBA7';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-11, 12);
    c.lineTo(6, 12);
    c.stroke();
    c.save();
    c.translate(14, 14);
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(8, 8);
        c.lineTo(22, 22);
        c.lineTo(18, 26);
        c.lineTo(4, 12);
        c.closePath();
      },
      '#6B3F22',
      { lw: 2.6 },
    );
    drawOutlined(c, circle(c, 0, 0, 14), 'rgba(191,232,245,0.85)', { lw: 4 });
    c.restore();
  },
  blackout: (c) => {
    // a dark bulb with a red slash
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.arc(0, -8, 22, 0, Math.PI * 2);
      },
      '#6D7494',
      { lw: 3.4 },
    );
    drawOutlined(c, () => rr(c, -11, 12, 22, 14, 3), '#B8C4CC', { lw: 3 });
    c.strokeStyle = '#2A2F48';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-8, 12);
    c.lineTo(-5, -4);
    c.lineTo(0, 2);
    c.lineTo(5, -4);
    c.lineTo(8, 12);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, -8, 16, Math.PI * 1.1, Math.PI * 1.45);
    c.stroke();
    c.strokeStyle = C.ink;
    c.lineWidth = 11;
    c.beginPath();
    c.moveTo(-30, 30);
    c.lineTo(30, -34);
    c.stroke();
    c.strokeStyle = C.danger;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(-30, 30);
    c.lineTo(30, -34);
    c.stroke();
  },
  birthday: (c) => {
    // a two-tier cake with a candle
    drawOutlined(c, () => rr(c, -28, 2, 56, 26, 6), '#FFF4E0', { lw: 3.2 });
    drawOutlined(c, () => rr(c, -20, -16, 40, 20, 5), '#FF9FC8', { lw: 3.2 });
    c.fillStyle = '#FFF4E0';
    for (const x of [-16, -6, 4, 14]) {
      c.beginPath();
      c.ellipse(x, -15, 4.5, 6, 0, 0, Math.PI);
      c.fill();
    }
    c.fillStyle = C.tomato;
    for (const x of [-18, -6, 6, 18]) {
      c.beginPath();
      c.arc(x, 14, 3, 0, Math.PI * 2);
      c.fill();
    }
    drawOutlined(c, () => rr(c, -3, -30, 6, 14, 2), '#6FC3F0', { lw: 2.4 });
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(0, -46);
        c.bezierCurveTo(7, -40, 6, -33, 0, -31);
        c.bezierCurveTo(-6, -33, -7, -40, 0, -46);
        c.closePath();
      },
      C.fire2,
      { lw: 2.4 },
    );
  },
  rat: (c) => {
    // a rat head: big round ear, pointed snout, whiskers
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(-26, 16);
        c.bezierCurveTo(-30, -14, -10, -26, 8, -22);
        c.bezierCurveTo(22, -20, 34, 0, 36, 10);
        c.bezierCurveTo(30, 20, 6, 26, -26, 16);
        c.closePath();
      },
      '#A9A6B5',
      { lw: 3.4 },
    );
    drawOutlined(c, circle(c, -10, -22, 13), '#A9A6B5', { lw: 3.2 });
    c.fillStyle = '#F2A5B5';
    c.beginPath();
    c.arc(-10, -22, 7, 0, Math.PI * 2);
    c.fill();
    drawOutlined(c, circle(c, 36, 10, 5.5), '#F2A5B5', { lw: 2.4 });
    c.fillStyle = C.ink;
    c.beginPath();
    c.arc(14, -2, 4.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(15.4, -3.4, 1.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = C.ink;
    c.lineWidth = 2;
    c.lineCap = 'round';
    for (const dy of [-4, 2, 8]) {
      c.beginPath();
      c.moveTo(26, 12 + dy * 0.3);
      c.lineTo(46, 12 + dy);
      c.stroke();
    }
  },
  frost: (c) => {
    // a snowflake: three crossed arms with little branches
    c.strokeStyle = C.ink;
    c.lineCap = 'round';
    for (const [w, col] of [
      [11, C.ink],
      [6, '#F2FBFF'],
    ] as const) {
      c.strokeStyle = col;
      c.lineWidth = w;
      for (let i = 0; i < 3; i++) {
        c.save();
        c.rotate((i * Math.PI) / 3);
        c.beginPath();
        c.moveTo(0, -34);
        c.lineTo(0, 34);
        for (const y of [-22, 22]) {
          c.moveTo(-10, y - Math.sign(y) * 9);
          c.lineTo(0, y);
          c.lineTo(10, y - Math.sign(y) * 9);
        }
        c.stroke();
        c.restore();
      }
    }
  },
};
