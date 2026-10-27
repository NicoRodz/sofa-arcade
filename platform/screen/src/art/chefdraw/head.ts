// Chef parts drawn on a canvas. Origin is the chef's feet; the head centre is (0, -68). Used for textures and DOM portraits.
import { C, chefOf, hairOf, skinOf } from '../tokens';
import { circle, drawOutlined, rr, shade, vgrad } from '../gfx';
import type { Painter } from '@pichi/core/avatar/painter';
import { HEAD_Y, skinGrad } from './body';

function backHair(c: Painter, slot: number) {
  const ch = chefOf(slot),
    hair = hairOf(slot);
  if (ch.accessory === 'pigtails') {
    for (const sx of [-1, 1]) {
      drawOutlined(c, circle(c, sx * 27, HEAD_Y + 6, 9.5), vgrad(c, HEAD_Y - 4, HEAD_Y + 16, shade(hair, 0.15), hair), { lw: 2.5 });
    }
  }
}

function ears(c: Painter, skin: string) {
  for (const sx of [-1, 1]) drawOutlined(c, circle(c, sx * 21.5, HEAD_Y + 2, 5.2), shade(skin, -0.04), { lw: 2.5 });
}

export function drawHead(c: Painter, slot: number) {
  const skin = skinOf(slot),
    ch = chefOf(slot),
    hair = hairOf(slot);
  backHair(c, slot);
  ears(c, skin);
  drawOutlined(c, circle(c, 0, HEAD_Y, 22), skinGrad(c, skin), { lw: 3 });
  // hair at the temples, mostly hidden under the hat
  c.fillStyle = hair;
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(sx * 19, HEAD_Y - 11, 5, 8, sx * -0.4, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,154,162,0.5)';
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(sx * 13.5, HEAD_Y + 6, 5.2, 3.2, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = shade(skin, -0.14);
  c.beginPath();
  c.ellipse(0, HEAD_Y + 3, 2.3, 1.7, 0, 0, Math.PI * 2);
  c.fill();
  if (ch.accessory === 'pigtails') {
    for (const sx of [-1, 1]) drawOutlined(c, () => rr(c, sx * 22 - 3, HEAD_Y - 8, 6, 9, 2), ch.color, { lw: 2 });
  }
}

export function drawHeadBack(c: Painter, slot: number) {
  const skin = skinOf(slot),
    hair = hairOf(slot);
  backHair(c, slot);
  ears(c, skin);
  drawOutlined(c, circle(c, 0, HEAD_Y, 22), vgrad(c, HEAD_Y - 22, HEAD_Y + 22, shade(hair, 0.22), hair), { lw: 3 });
  if (chefOf(slot).accessory === 'pigtails')
    for (const sx of [-1, 1]) drawOutlined(c, () => rr(c, sx * 22 - 3, HEAD_Y - 8, 6, 9, 2), chefOf(slot).color, { lw: 2 });
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath();
  c.ellipse(-7, HEAD_Y - 9, 8, 4, -0.5, 0, Math.PI * 2);
  c.fill();
}

// Layer under the mouth: the beard.
export function drawFaceA(c: Painter, slot: number) {
  if (chefOf(slot).accessory !== 'beard') return;
  const skin = skinOf(slot);
  c.beginPath();
  c.arc(0, HEAD_Y, 23.5, Math.PI * 0.1, Math.PI * 0.9, false);
  c.quadraticCurveTo(-15, HEAD_Y + 6, -9, HEAD_Y + 7);
  c.quadraticCurveTo(0, HEAD_Y + 4, 9, HEAD_Y + 7);
  c.quadraticCurveTo(15, HEAD_Y + 6, 22.4, HEAD_Y + 7);
  c.closePath();
  c.fillStyle = vgrad(c, HEAD_Y + 4, HEAD_Y + 28, '#8A5A33', '#5E3A1F');
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = C.ink;
  c.stroke();
  c.fillStyle = skin;
  c.beginPath();
  c.ellipse(0, HEAD_Y + 15, 8.5, 4.6, 0, 0, Math.PI * 2);
  c.fill();
}

// Layer over the mouth: glasses, moustache.
export function drawFaceB(c: Painter, slot: number) {
  const a = chefOf(slot).accessory;
  if (a === 'glasses') {
    for (const sx of [-1, 1]) {
      c.fillStyle = 'rgba(190,225,255,0.35)';
      c.beginPath();
      c.arc(sx * 8.5, HEAD_Y - 2, 8, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = C.ink;
      c.lineWidth = 2.6;
      c.beginPath();
      c.arc(sx * 8.5, HEAD_Y - 2, 8, 0, Math.PI * 2);
      c.stroke();
    }
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(-1, HEAD_Y - 3);
    c.quadraticCurveTo(0, HEAD_Y - 5, 1, HEAD_Y - 3);
    c.stroke();
    c.beginPath();
    c.moveTo(-16.5, HEAD_Y - 3);
    c.lineTo(-21, HEAD_Y - 5);
    c.moveTo(16.5, HEAD_Y - 3);
    c.lineTo(21, HEAD_Y - 5);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(-8.5, HEAD_Y - 2, 5.2, Math.PI * 1.1, Math.PI * 1.4);
    c.stroke();
  } else if (a === 'mustache') {
    c.fillStyle = '#2B1B17';
    c.strokeStyle = '#2B1B17';
    c.lineWidth = 1.5;
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, HEAD_Y + 9);
      c.bezierCurveTo(sx * 4, HEAD_Y + 5, sx * 11, HEAD_Y + 5.5, sx * 14.5, HEAD_Y + 10);
      c.bezierCurveTo(sx * 18, HEAD_Y + 14.5, sx * 14, HEAD_Y + 17.5, sx * 11.5, HEAD_Y + 15);
      c.bezierCurveTo(sx * 10, HEAD_Y + 12.5, sx * 5, HEAD_Y + 12.5, 0, HEAD_Y + 12.5);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-9, HEAD_Y + 8.4);
    c.quadraticCurveTo(-5, HEAD_Y + 7.2, -2, HEAD_Y + 8.8);
    c.stroke();
  }
}
