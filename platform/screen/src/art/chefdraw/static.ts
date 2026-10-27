// Chef parts drawn on a canvas. Origin is the chef's feet; the head centre is (0, -68). Used for textures and DOM portraits.
import { skinOf } from '../tokens';
import { circle, drawOutlined, rr, vgrad } from '../gfx';
import type { Painter } from '@pichi/core/avatar/painter';
import { HEAD_Y, MOUTH_DY, drawShadow, drawShoe, drawArm, drawBody } from './body';
import { drawHead, drawFaceA, drawFaceB } from './head';
import { drawEye, drawMouth } from './face';
import { drawHat, drawPropBlades } from './hats';

/** DOM badge for the lobby chips: a round cyan sticker with the propeller (the chip is too short for the beanie itself). Centre = (0, 0), radius 20. */
export function drawAssistBadge(c: Painter) {
  drawOutlined(c, circle(c, 0, 0, 19), vgrad(c, -19, 19, '#7FE3FF', '#1FA9E0'), { lw: 3.5 });
  c.save();
  c.translate(0, -3);
  c.scale(0.42, 0.42);
  drawPropBlades(c);
  c.restore();
  drawOutlined(c, () => rr(c, -1.8, -2, 3.6, 13, 1.5), '#F1E9D8', { lw: 2 });
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.beginPath();
  c.ellipse(-8, -11, 5, 2, -0.6, 0, Math.PI * 2);
  c.fill();
}

// Whole chef standing still: lobby chips and results podium.
export function drawChefStatic(c: Painter, slot: number, mood: 'idle' | 'happy' = 'idle') {
  drawShadow(c);
  for (const sx of [-1, 1]) {
    c.save();
    c.translate(sx * 10, -3);
    drawShoe(c);
    c.restore();
  }
  for (const sx of [-1, 1]) {
    c.save();
    c.translate(sx * 25, -41);
    c.rotate(sx * -0.1);
    drawArm(c, skinOf(slot));
    c.restore();
  }
  drawBody(c, slot);
  drawHead(c, slot);
  drawFaceA(c, slot);
  for (const sx of [-1, 1]) {
    c.save();
    c.translate(sx * 7, HEAD_Y - 2);
    drawEye(c, mood === 'happy' ? 'happy' : 'open');
    c.restore();
  }
  c.save();
  c.translate(0, HEAD_Y + MOUTH_DY);
  drawMouth(c, mood === 'happy' ? 'open' : 'smile');
  c.restore();
  drawFaceB(c, slot);
  drawHat(c, slot);
}
