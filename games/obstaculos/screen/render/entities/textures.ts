// Baked textures of the level's entities (stars, flags, rings, boxes, keys, rocks, saws).
import type Phaser from 'phaser';
import { circle, drawOutlined, makeTex, rr, star as starPath, vgrad } from '@pichi/screen-kit/art/gfx';
import { INK } from '../biome';

export function buildEntityTextures(scene: Phaser.Scene) {
  makeTex(scene, 'ob_star', { w: 44, h: 44 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath();
    c.ellipse(1, 3, 17, 15, 0, 0, 7);
    c.fill();
    drawOutlined(c, () => starPath(c, 0, 0, 18, 8), vgrad(c, -18, 18, '#FFE97A', '#F2A60D'), { lw: 3 });
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.ellipse(-5, -6, 3.5, 2, -0.6, 0, 7);
    c.fill();
  });
  makeTex(scene, 'ob_halo', { w: 100, h: 100 }, (c) => {
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 46);
    g.addColorStop(0, 'rgba(255,240,160,0.8)');
    g.addColorStop(1, 'rgba(255,220,100,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 46, 0, 7);
    c.fill();
  });
  makeTex(scene, 'ob_pole', { w: 16, h: 80, ox: 8, oy: 80 }, (c) => {
    drawOutlined(c, () => rr(c, -3, -76, 6, 76, 3), vgrad(c, -76, 0, '#E8EEF2', '#8D9BA5'), { lw: 2.6 });
    drawOutlined(c, circle(c, 0, -77, 5), '#FFD23F', { lw: 2.4 });
    drawOutlined(c, () => rr(c, -8, -4, 16, 7, 3), '#7D8B95', { lw: 2.4 });
  });
  const pennant = (key: string, fill: string, fill2: string) =>
    makeTex(scene, key, { w: 56, h: 40, ox: 0, oy: 20 }, (c) => {
      drawOutlined(
        c,
        () => {
          c.beginPath();
          c.moveTo(0, -18);
          c.quadraticCurveTo(24, -24, 50, -8);
          c.lineTo(36, 2);
          c.lineTo(50, 12);
          c.quadraticCurveTo(24, 18, 0, 14);
          c.closePath();
        },
        vgrad(c, -18, 14, fill, fill2),
        { lw: 2.8 },
      );
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.fillRect(4, -14, 28, 3);
    });
  pennant('ob_flag_off', '#C9C0B4', '#968C80');
  pennant('ob_flag_on', '#FF6A5A', '#C62E22');
  makeTex(scene, 'ob_goalflag', { w: 80, h: 56, ox: 0, oy: 28 }, (c) => {
    c.save();
    c.beginPath();
    c.moveTo(0, -26);
    c.quadraticCurveTo(34, -34, 74, -14);
    c.lineTo(74, 18);
    c.quadraticCurveTo(34, 30, 0, 24);
    c.closePath();
    c.clip();
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, -40, 80, 80);
    c.fillStyle = INK;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) if ((x + y) % 2 === 0) c.fillRect(x * 13, -34 + y * 12, 13, 12);
    c.restore();
    c.beginPath();
    c.moveTo(0, -26);
    c.quadraticCurveTo(34, -34, 74, -14);
    c.lineTo(74, 18);
    c.quadraticCurveTo(34, 30, 0, 24);
    c.closePath();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.stroke();
  });
  makeTex(scene, 'ob_ring', { w: 44, h: 44 }, (c) => {
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.arc(0, 0, 14, 0, 7);
      },
      'rgba(0,0,0,0)',
      { lw: 9.5 },
    );
    c.strokeStyle = '#D9DEE2';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, 0, 14, 0, 7);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 14, Math.PI * 1.1, Math.PI * 1.45);
    c.stroke();
    drawOutlined(c, () => rr(c, -5, -22, 10, 10, 3), '#7D8B95', { lw: 2.4 });
  });
  // Elastic ring (campaign dynamic 11): the same ring in orange rubber with a coiled spring up to its hook, so it reads as "stretches" from across the screen.
  makeTex(scene, 'ob_ring_bungee', { w: 44, h: 52, oy: 26 }, (c) => {
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.arc(0, 4, 14, 0, 7);
      },
      'rgba(0,0,0,0)',
      { lw: 9.5 },
    );
    c.strokeStyle = '#FF9A2E';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, 4, 14, 0, 7);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 4, 14, Math.PI * 1.1, Math.PI * 1.45);
    c.stroke();
    c.lineJoin = 'round';
    c.strokeStyle = INK;
    c.lineWidth = 5.4;
    c.beginPath();
    c.moveTo(0, -10);
    for (let i = 0; i < 4; i++) {
      c.lineTo(i % 2 ? -5 : 5, -14 - i * 3);
    }
    c.stroke();
    c.strokeStyle = '#D9DEE2';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(0, -10);
    for (let i = 0; i < 4; i++) {
      c.lineTo(i % 2 ? -5 : 5, -14 - i * 3);
    }
    c.stroke();
    drawOutlined(c, () => rr(c, -5, -26, 10, 7, 3), '#7D8B95', { lw: 2.4 });
  });
  makeTex(scene, 'ob_box', { w: 52, h: 52 }, (c) => {
    drawOutlined(c, () => rr(c, -22, -22, 44, 44, 5), vgrad(c, -22, 22, '#E2A961', '#B57A3A'), { lw: 3 });
    c.strokeStyle = 'rgba(80,40,10,0.55)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-18, -18);
    c.lineTo(18, 18);
    c.moveTo(18, -18);
    c.lineTo(-18, 18);
    c.stroke();
    c.strokeStyle = INK;
    c.lineWidth = 2.6;
    c.strokeRect(-16, -16, 32, 32);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(-18, -19, 22, 2.4);
  });
  makeTex(scene, 'ob_heavy', { w: 52, h: 52 }, (c) => {
    drawOutlined(c, () => rr(c, -22, -22, 44, 44, 5), vgrad(c, -22, 22, '#8F9AA3', '#59636B'), { lw: 3 });
    c.fillStyle = '#3F474D';
    for (const [x, y] of [
      [-22, -22],
      [10, -22],
      [-22, 10],
      [10, 10],
    ] as const) {
      c.fillRect(x, y, 12, 12);
    }
    c.strokeStyle = INK;
    c.lineWidth = 2.4;
    for (const [x, y] of [
      [-22, -22],
      [10, -22],
      [-22, 10],
      [10, 10],
    ] as const)
      c.strokeRect(x, y, 12, 12);
    c.strokeStyle = '#FFC21A';
    c.lineWidth = 4.5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-9, -9);
    c.lineTo(9, 9);
    c.moveTo(9, -9);
    c.lineTo(-9, 9);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-5, -19);
    c.lineTo(8, -19);
    c.stroke();
  });
  makeTex(scene, 'ob_key', { w: 44, h: 44 }, (c) => {
    c.rotate(-0.6);
    drawOutlined(c, circle(c, -8, 0, 8), '#FFD23F', { lw: 3 });
    c.fillStyle = INK;
    c.beginPath();
    c.arc(-8, 0, 3, 0, 7);
    c.fill();
    drawOutlined(c, () => rr(c, -1, -3, 22, 6, 2), '#FFD23F', { lw: 3 });
    drawOutlined(c, () => rr(c, 13, 2, 4, 8, 1.5), '#FFD23F', { lw: 2.4 });
    drawOutlined(c, () => rr(c, 7, 2, 4, 6, 1.5), '#FFD23F', { lw: 2.4 });
  });
  makeTex(scene, 'ob_rock', { w: 52, h: 52 }, (c) => {
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(-20, 8);
        c.lineTo(-16, -12);
        c.lineTo(-2, -22);
        c.lineTo(16, -16);
        c.lineTo(22, 4);
        c.lineTo(10, 20);
        c.lineTo(-12, 18);
        c.closePath();
      },
      vgrad(c, -22, 20, '#6B6163', '#3A3234'),
      { lw: 3 },
    );
    c.strokeStyle = '#FF5A1F';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-6, -8);
    c.lineTo(2, 0);
    c.lineTo(-2, 8);
    c.stroke();
  });
  makeTex(scene, 'ob_saw', { w: 60, h: 60 }, (c) => {
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2,
        r = i % 2 ? 22 : 28;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = vgrad(c, -28, 28, '#E8EEF2', '#8D9BA5');
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.stroke();
    drawOutlined(c, circle(c, 0, 0, 6), '#5E6B78', { lw: 2.6 });
  });
}
