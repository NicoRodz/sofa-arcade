// Chef parts drawn on a canvas. Origin is the chef's feet; the head centre is (0, -68). Used for textures and DOM portraits.
import { C } from '../tokens';
import type { Painter } from '@pichi/core/avatar/painter';

export function drawEye(c: Painter, kind: 'open' | 'happy' | 'x') {
  if (kind === 'open') {
    c.fillStyle = C.ink;
    c.beginPath();
    c.ellipse(0, 0, 2.9, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(0.9, -1.5, 1.2, 0, Math.PI * 2);
    c.fill();
  } else if (kind === 'happy') {
    c.strokeStyle = C.ink;
    c.lineWidth = 2.8;
    c.beginPath();
    c.moveTo(-4, 1.6);
    c.quadraticCurveTo(0, -4.2, 4, 1.6);
    c.stroke();
  } else {
    c.strokeStyle = C.ink;
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(-3.4, -3.4);
    c.lineTo(3.4, 3.4);
    c.moveTo(3.4, -3.4);
    c.lineTo(-3.4, 3.4);
    c.stroke();
  }
}

export function drawMouth(c: Painter, kind: 'smile' | 'open' | 'worry') {
  c.strokeStyle = C.ink;
  c.lineWidth = 2.3;
  if (kind === 'smile') {
    c.beginPath();
    c.moveTo(-4, 0);
    c.quadraticCurveTo(0, 4, 4, 0);
    c.stroke();
  } else if (kind === 'open') {
    c.beginPath();
    c.moveTo(-6, -1);
    c.quadraticCurveTo(0, 9, 6, -1);
    c.closePath();
    c.fillStyle = '#7A1F1F';
    c.fill();
    c.stroke();
    c.fillStyle = '#FF8A8A';
    c.beginPath();
    c.ellipse(0, 3.2, 2.6, 1.6, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(-4, 2);
    c.quadraticCurveTo(-2, -1, 0, 1);
    c.quadraticCurveTo(2, 3, 4, 0);
    c.stroke();
  }
}

export function drawDrop(c: Painter) {
  c.beginPath();
  c.moveTo(0, -7);
  c.bezierCurveTo(6, 0, 5, 5, 0, 5);
  c.bezierCurveTo(-5, 5, -6, 0, 0, -7);
  c.closePath();
  c.fillStyle = '#7EC8F2';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = C.ink;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath();
  c.ellipse(-1.6, 0, 1, 1.8, 0, 0, Math.PI * 2);
  c.fill();
}
