// Baked textures of the explorer (harness, helmet, speech bubble, badge, hint icons).
import type Phaser from 'phaser';
import { C, CHEFS, SKINS, chefOf } from '@pichi/screen-kit/art/tokens';
import { HEAD_Y, drawBody, drawBodyBack } from '@pichi/screen-kit/art/chefdraw';
import { Canvas2DPainter } from '@pichi/core/avatar/canvas2d-painter';
import { buildChefTextures } from '@pichi/screen-kit/art/chef';
import { makeTex, type Ctx } from '@pichi/screen-kit/art/gfx';
import { circle, drawOutlined, mix, rr, shade, vgrad } from '@pichi/screen-kit/art/gfx';
import { INK } from '../biome';
import type { HandAction } from '../view';

export const RIG_SCALE = 0.5; // design units -> world px. Chef is 90 units from feet to crown: ~45 px, the hitbox height
const BOX = { w: 120, h: 170, ox: 60, oy: 150 };
const WEBBING = '#33485C',
  WEBBING_LIGHT = '#566E85';

function harness(c: Ctx) {
  // chest strap from the left shoulder to the right hip, a second one crossing it, and a waist belt with a carabiner
  c.lineCap = 'round';
  for (const [w, col] of [
    [8.5, INK],
    [4.6, WEBBING],
  ] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(-14, -48);
    c.lineTo(15, -10);
    c.stroke();
    c.beginPath();
    c.moveTo(14, -48);
    c.lineTo(-15, -10);
    c.stroke();
  }
  c.strokeStyle = WEBBING_LIGHT;
  c.lineWidth = 1;
  c.setLineDash([2, 3]);
  c.beginPath();
  c.moveTo(-14, -48);
  c.lineTo(15, -10);
  c.moveTo(14, -48);
  c.lineTo(-15, -10);
  c.stroke();
  c.setLineDash([]);
  drawOutlined(c, () => rr(c, -23, -14, 46, 9, 3), vgrad(c, -14, -5, WEBBING_LIGHT, WEBBING), { lw: 2.5 });
  drawOutlined(c, () => rr(c, -6, -15.5, 12, 12, 3), '#E8B93C', { lw: 2.2 });
  c.fillStyle = INK;
  c.fillRect(-2.2, -12, 4.4, 6);
  // carabiner
  c.strokeStyle = INK;
  c.lineWidth = 5.2;
  c.beginPath();
  c.ellipse(15, -9, 4.2, 6.2, 0.2, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = '#D9DEE2';
  c.lineWidth = 2.4;
  c.stroke();
}
function harnessBack(c: Ctx) {
  c.lineCap = 'round';
  for (const [w, col] of [
    [8.5, INK],
    [4.6, WEBBING],
  ] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(-14, -48);
    c.lineTo(-4, -22);
    c.moveTo(14, -48);
    c.lineTo(4, -22);
    c.stroke();
  }
  drawOutlined(c, () => rr(c, -23, -14, 46, 9, 3), vgrad(c, -14, -5, WEBBING_LIGHT, WEBBING), { lw: 2.5 });
}

function drawHelmet(c: Ctx, slot: number) {
  const ch = chefOf(slot);
  const dome = () => {
    c.beginPath();
    c.moveTo(-25, HEAD_Y - 8);
    c.bezierCurveTo(-27, HEAD_Y - 34, 27, HEAD_Y - 34, 25, HEAD_Y - 8);
    c.lineTo(-25, HEAD_Y - 8);
    c.closePath();
  };
  drawOutlined(c, dome, vgrad(c, HEAD_Y - 32, HEAD_Y - 8, mix(ch.color, '#FFFFFF', 0.3), ch.color), { lw: 3 });
  c.save();
  dome();
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.8)';
  c.fillRect(-4, HEAD_Y - 34, 8, 30); // centre stripe
  c.strokeStyle = ch.dark;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(-14, HEAD_Y - 12);
  c.quadraticCurveTo(-12, HEAD_Y - 26, -6, HEAD_Y - 30);
  c.stroke();
  c.restore();
  drawOutlined(c, () => rr(c, -28, HEAD_Y - 11, 56, 7, 3.5), vgrad(c, HEAD_Y - 11, HEAD_Y - 4, mix(ch.color, '#000000', 0.05), ch.dark), {
    lw: 2.6,
  });
  // headlamp
  drawOutlined(c, circle(c, 0, HEAD_Y - 19, 5.6), '#FFE9A0', { lw: 2.2 });
  c.fillStyle = '#FFFFFF';
  c.beginPath();
  c.arc(-1.4, HEAD_Y - 20.4, 1.7, 0, 7);
  c.fill();
  if (ch.accessory === 'bow') {
    // the bow sits on the helmet
    const bx = 15,
      by = HEAD_Y - 30;
    drawOutlined(
      c,
      () => {
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx - 12, by - 8);
        c.lineTo(bx - 12, by + 8);
        c.closePath();
        c.moveTo(bx, by);
        c.lineTo(bx + 12, by - 8);
        c.lineTo(bx + 12, by + 8);
        c.closePath();
      },
      '#FFFFFF',
      { lw: 2.5 },
    );
    drawOutlined(c, circle(c, bx, by, 3.8), ch.dark, { lw: 2 });
  }
}

function drawBubble(c: Ctx) {
  const g = c.createRadialGradient(-10, -12, 4, 0, 0, 52);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, 'rgba(160,220,255,0.22)');
  g.addColorStop(1, 'rgba(110,190,255,0.42)');
  c.beginPath();
  c.arc(0, 0, 50, 0, Math.PI * 2);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 3.5;
  c.strokeStyle = 'rgba(43,27,23,0.75)';
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 5;
  c.beginPath();
  c.arc(0, 0, 40, Math.PI * 1.1, Math.PI * 1.42);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.arc(0, 0, 40, Math.PI * 1.52, Math.PI * 1.58);
  c.stroke();
}

function drawBadge(c: Ctx, slot: number) {
  const ch = chefOf(slot);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.arc(1, 3, 14, 0, 7);
  c.fill();
  drawOutlined(c, circle(c, 0, 0, 14), ch.color, { lw: 3 });
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.beginPath();
  c.ellipse(-3, -7, 7, 3, -0.3, 0, 7);
  c.fill();
  c.font = '800 17px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 4;
  c.strokeStyle = INK;
  c.strokeText(String(slot + 1), 0, 1);
  c.fillStyle = '#fff';
  c.fillText(String(slot + 1), 0, 1);
}

// Little icons over the head: what B would do now.
function drawIcon(c: Ctx, kind: HandAction) {
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.arc(1, 3, 15, 0, 7);
  c.fill();
  drawOutlined(c, circle(c, 0, 0, 15), '#FFF4E0', { lw: 3 });
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  switch (kind) {
    case 'anchor':
      c.beginPath();
      c.arc(0, 1, 6, 0, 7);
      c.stroke();
      c.fillStyle = '#B8C4CC';
      c.beginPath();
      c.arc(0, 1, 6, 0, 7);
      c.stroke();
      break;
    case 'lift':
      c.beginPath();
      c.moveTo(0, 7);
      c.lineTo(0, -6);
      c.moveTo(-6, 0);
      c.lineTo(0, -7);
      c.lineTo(6, 0);
      c.stroke();
      break;
    case 'grab':
      c.beginPath();
      c.roundRect(-6, -3, 12, 9, 3);
      c.stroke();
      c.beginPath();
      c.moveTo(-3, -3);
      c.lineTo(-3, -7);
      c.moveTo(1, -3);
      c.lineTo(1, -8);
      c.moveTo(5, -3);
      c.lineTo(5, -6);
      c.stroke();
      break;
    case 'plant':
      c.beginPath();
      c.moveTo(0, -7);
      c.lineTo(0, 5);
      c.moveTo(-6, 0);
      c.lineTo(0, 7);
      c.lineTo(6, 0);
      c.moveTo(-8, 8);
      c.lineTo(8, 8);
      c.stroke();
      break;
    case 'throw':
      c.beginPath();
      c.moveTo(-8, 5);
      c.quadraticCurveTo(-1, -12, 8, -3);
      c.moveTo(3, -7);
      c.lineTo(8, -3);
      c.lineTo(2, -1);
      c.stroke();
      break;
    case 'release':
      c.beginPath();
      c.moveTo(-6, -4);
      c.lineTo(6, 4);
      c.moveTo(6, -4);
      c.lineTo(-6, 4);
      c.stroke();
      break;
    default:
      break;
  }
}

const ICONS: HandAction[] = ['anchor', 'lift', 'grab', 'plant', 'throw', 'release'];

export function buildRigTextures(scene: Phaser.Scene) {
  buildChefTextures(scene); // shoes, arms, eyes, mouths, heads, plates (the pizza rig parts)
  for (let i = 0; i < CHEFS.length; i++) {
    makeTex(scene, `ex_body_${i}`, BOX, (c) => {
      drawBody(new Canvas2DPainter(c), i);
      harness(c);
    });
    makeTex(scene, `ex_bodyb_${i}`, BOX, (c) => {
      drawBodyBack(new Canvas2DPainter(c), i);
      harnessBack(c);
    });
    makeTex(scene, `ex_helmet_${i}`, BOX, (c) => drawHelmet(c, i));
    makeTex(scene, `ex_badge_${i}`, { w: 40, h: 40 }, (c) => drawBadge(c, i));
  }
  makeTex(scene, 'ex_bubble', { w: 120, h: 120 }, drawBubble);
  for (const k of ICONS) makeTex(scene, `ex_icon_${k}`, { w: 40, h: 40 }, (c) => drawIcon(c, k));
  void SKINS;
  void shade;
  void C;
}
