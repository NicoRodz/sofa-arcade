// The three parallax layers (far, mid, near), drawn once per biome onto a tileable canvas.
import { TW, ground, palm, peaks, profile, rngOf, tree } from './noise';
import type { Biome } from '../../../index';
import { lerpColor, type Palette } from '../biome';
import type { Ctx } from '../tiledraw';

export function layerFar(c: Ctx, b: Biome, p: Palette) {
  const haze = p.haze;
  const col = lerpColor(p.far, haze, 0.25);
  switch (b) {
    case 'beach': {
      c.fillStyle = lerpColor('#3BA7C9', haze, 0.45);
      c.fillRect(0, 330, TW, 60); // sea band
      c.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 9; i++) c.fillRect(30 + i * 113, 345 + (i % 3) * 12, 40 + (i % 4) * 14, 3);
      ground(c, profile(11, [1, 2, 3]), 400, 26, lerpColor(p.mid, haze, 0.5));
      break;
    }
    case 'forest':
      peaks(c, 21, 6, 410, 120, 230, 110, 190, col);
      ground(c, profile(22, [2, 3, 5]), 395, 28, lerpColor(p.far, p.mid, 0.4));
      break;
    case 'mine': {
      ground(c, profile(31, [2, 3, 7]), 300, 90, col);
      c.fillStyle = col;
      for (let i = 0; i < 12; i++) {
        const x = (i + 0.5) * 85;
        c.beginPath();
        c.moveTo(x - 20, 0);
        c.lineTo(x, 70 + (i % 4) * 36);
        c.lineTo(x + 20, 0);
        c.closePath();
        c.fill();
      }
      break;
    }
    case 'glacier':
      peaks(c, 41, 5, 420, 190, 330, 130, 220, col, '#F4FDFF');
      break;
    case 'volcano': {
      peaks(c, 51, 7, 420, 70, 150, 90, 150, lerpColor(p.far, p.haze, 0.2));
      const cone = (x0: number) => {
        c.beginPath();
        c.moveTo(x0 - 330, 440);
        c.lineTo(x0 - 56, 150);
        c.lineTo(x0 + 56, 150);
        c.lineTo(x0 + 330, 440);
        c.closePath();
        c.fillStyle = lerpColor('#3A2426', p.haze, 0.2);
        c.fill();
      };
      cone(TW / 2);
      cone(TW / 2 - TW);
      cone(TW / 2 + TW);
      const g = c.createRadialGradient(TW / 2, 150, 4, TW / 2, 150, 90);
      g.addColorStop(0, 'rgba(255,170,60,0.95)');
      g.addColorStop(1, 'rgba(255,90,30,0)');
      c.fillStyle = g;
      c.fillRect(TW / 2 - 100, 70, 200, 160);
      c.fillStyle = 'rgba(120,100,100,0.5)';
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.arc(TW / 2 + Math.sin(i * 1.7) * 26, 120 - i * 34, 26 + i * 8, 0, 7);
        c.fill();
      }
      break;
    }
  }
}
export function layerMid(c: Ctx, b: Biome, p: Palette) {
  const r = rngOf(7 + b.length);
  const col = lerpColor(p.mid, p.haze, 0.18);
  switch (b) {
    case 'beach': {
      ground(c, profile(61, [2, 3, 4]), 440, 22, col);
      for (let i = 0; i < 5; i++)
        palm(c, 90 + i * 200 + r() * 40, 440 - 12, 130 + r() * 60, lerpColor('#6B8E6B', p.haze, 0.2), lerpColor('#3E8A68', p.haze, 0.15));
      // pier posts
      c.fillStyle = lerpColor(p.wood, p.haze, 0.3);
      for (let i = 0; i < 6; i++) c.fillRect(560 + i * 34, 408, 7, 60);
      c.fillRect(550, 404, 220, 8);
      break;
    }
    case 'forest': {
      for (let i = 0; i < 13; i++) {
        const x = (i + r() * 0.6) * 80,
          h = 260 + r() * 160;
        tree(c, x, 480, h, 14 + r() * 10, lerpColor('#5B3A29', p.haze, 0.35), lerpColor(p.mid, p.haze, 0.2));
      }
      ground(c, profile(62, [3, 5, 8]), 480, 12, col);
      break;
    }
    case 'mine': {
      c.strokeStyle = lerpColor(p.wood, '#000000', 0.35);
      c.lineWidth = 9;
      for (let i = 0; i < 4; i++) {
        const x = 60 + i * 260;
        c.beginPath();
        c.moveTo(x, 520);
        c.lineTo(x, 190);
        c.moveTo(x + 150, 520);
        c.lineTo(x + 150, 190);
        c.moveTo(x - 20, 210);
        c.lineTo(x + 170, 210);
        c.moveTo(x, 330);
        c.lineTo(x + 150, 210);
        c.moveTo(x + 150, 330);
        c.lineTo(x, 210);
        c.stroke();
      }
      c.strokeStyle = 'rgba(0,0,0,0.5)';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(0, 470);
      c.lineTo(TW, 470);
      c.stroke();
      c.lineWidth = 4;
      for (let x = 0; x < TW; x += 36) {
        c.beginPath();
        c.moveTo(x, 462);
        c.lineTo(x, 482);
        c.stroke();
      }
      break;
    }
    case 'glacier': {
      for (let i = 0; i < 8; i++) {
        const x = (i + 0.2 + r() * 0.5) * 128,
          w = 34 + r() * 30,
          h = 200 + r() * 200;
        c.beginPath();
        c.moveTo(x - w, 500);
        c.lineTo(x - w * 0.8, 500 - h);
        c.lineTo(x - w * 0.2, 500 - h - 24 - r() * 40);
        c.lineTo(x + w * 0.5, 500 - h - 8);
        c.lineTo(x + w, 500 - h * 0.7);
        c.lineTo(x + w, 500);
        c.closePath();
        c.fillStyle = lerpColor(p.mid, p.haze, 0.25 + r() * 0.1);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.25)';
        c.fillRect(x - w * 0.8, 500 - h, w * 0.5, h);
      }
      break;
    }
    case 'volcano': {
      for (let i = 0; i < 10; i++) {
        const x = (i + 0.3) * 102.4,
          w = 20 + r() * 16,
          h = 110 + r() * 170;
        c.fillStyle = lerpColor(p.mid, p.haze, 0.1);
        c.fillRect(x - w, 500 - h, w * 2, h + 20);
        c.fillStyle = 'rgba(255,90,31,0.18)';
        c.fillRect(x - w, 500 - h, 5, h);
      }
      ground(c, profile(64, [2, 4, 6]), 495, 14, lerpColor(p.mid, '#000000', 0.2));
      c.fillStyle = 'rgba(255,90,31,0.55)';
      for (let i = 0; i < 6; i++) c.fillRect(40 + i * 170, 490, 60, 3);
      break;
    }
  }
}
export function layerNear(c: Ctx, b: Biome, p: Palette) {
  const r = rngOf(99 + b.length);
  const dark = lerpColor(p.near, '#000000', 0.1);
  switch (b) {
    case 'beach': {
      for (let i = 0; i < 24; i++) {
        const x = r() * TW,
          h = 24 + r() * 40;
        c.strokeStyle = lerpColor('#7FA85A', '#000000', 0.15);
        c.lineWidth = 3;
        c.lineCap = 'round';
        for (let k = -1; k <= 1; k++) {
          c.beginPath();
          c.moveTo(x, 512);
          c.quadraticCurveTo(x + k * 7, 512 - h * 0.6, x + k * 15, 512 - h);
          c.stroke();
        }
      }
      c.fillStyle = dark;
      ground(c, profile(71, [3, 7, 11]), 506, 6, dark);
      break;
    }
    case 'forest': {
      for (let i = 0; i < 14; i++) {
        const x = r() * TW,
          h = 40 + r() * 70;
        c.strokeStyle = lerpColor('#2F6B3A', '#000000', 0.15);
        c.lineWidth = 3;
        c.lineCap = 'round';
        for (let k = -3; k <= 3; k++) {
          c.beginPath();
          c.moveTo(x, 512);
          c.quadraticCurveTo(x + k * 14, 512 - h * 0.9, x + k * 22, 512 - h * (0.55 + 0.1 * Math.abs(k) * -1 + 0.4));
          c.stroke();
        }
      }
      ground(c, profile(72, [4, 9]), 508, 5, dark);
      break;
    }
    case 'mine': {
      c.strokeStyle = dark;
      c.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const x = 60 + i * 170 + r() * 40;
        c.beginPath();
        c.moveTo(x, 0);
        c.quadraticCurveTo(x + 26, 70 + r() * 40, x + 54, 40);
        c.stroke();
        c.fillStyle = '#FFD27A';
        c.beginPath();
        c.arc(x + 54, 44, 7, 0, 7);
        c.fill();
        const g = c.createRadialGradient(x + 54, 44, 2, x + 54, 44, 34);
        g.addColorStop(0, 'rgba(255,210,122,0.55)');
        g.addColorStop(1, 'rgba(255,210,122,0)');
        c.fillStyle = g;
        c.fillRect(x + 20, 10, 68, 68);
      }
      for (let i = 0; i < 10; i++) {
        const x = r() * TW,
          w = 20 + r() * 30;
        c.fillStyle = dark;
        c.beginPath();
        c.moveTo(x, 512);
        c.lineTo(x + w / 2, 512 - 20 - r() * 24);
        c.lineTo(x + w, 512);
        c.fill();
      }
      break;
    }
    case 'glacier': {
      for (let i = 0; i < 16; i++) {
        const x = r() * TW,
          h = 20 + r() * 50;
        c.beginPath();
        c.moveTo(x, 512);
        c.lineTo(x + 8, 512 - h);
        c.lineTo(x + 20, 512);
        c.closePath();
        c.fillStyle = lerpColor('#BFE8F5', '#5E6B78', 0.25);
        c.fill();
      }
      ground(c, profile(73, [3, 6]), 508, 6, lerpColor('#F4FDFF', '#9FD8F2', 0.2));
      break;
    }
    case 'volcano': {
      for (let i = 0; i < 12; i++) {
        const x = r() * TW,
          h = 24 + r() * 56,
          w = 22 + r() * 30;
        c.beginPath();
        c.moveTo(x, 512);
        c.lineTo(x + w * 0.3, 512 - h);
        c.lineTo(x + w * 0.7, 512 - h * 0.7);
        c.lineTo(x + w, 512);
        c.closePath();
        c.fillStyle = dark;
        c.fill();
      }
      c.fillStyle = 'rgba(255,170,60,0.85)';
      for (let i = 0; i < 22; i++) {
        c.beginPath();
        c.arc(r() * TW, 300 + r() * 200, 1.4 + r() * 1.6, 0, 7);
        c.fill();
      }
      ground(c, profile(74, [3, 6]), 509, 4, dark);
      break;
    }
  }
}
