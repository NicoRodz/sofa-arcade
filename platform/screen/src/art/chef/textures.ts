// The eight pizzaiolos: part textures plus a procedural rig (squash & stretch, walk bounce, chop, carry, expressions).
import type Phaser from 'phaser';
import type { Painter } from '@pichi/core/avatar';
import { C, chefOf, SKINS } from '../tokens';
import { Canvas2DPainter } from '@pichi/core/avatar';
import { domCanvas, makeTex, rr, type Ctx } from '../gfx';
import {
  drawAssistBadge,
  drawPropBlades,
  drawPropStem,
  drawArm,
  drawBody,
  drawBodyBack,
  drawChefStatic,
  drawDrop,
  drawEye,
  drawFaceA,
  drawFaceB,
  drawHat,
  drawHead,
  drawHeadBack,
  drawMouth,
  drawShadow,
  drawShoe,
} from '../chefdraw';

export const CHEF_SCALE = 1.05;

/** Texture draw callbacks hand us a raw 2D context: chefdraw paints through the Painter interface. */
const pen = (draw: (p: Painter) => void) => (c: Ctx) => draw(new Canvas2DPainter(c));

export const ITEM_SCALE = 0.72;

const BOX = { w: 120, h: 170, ox: 60, oy: 150 };

export function buildChefTextures(scene: Phaser.Scene) {
  makeTex(scene, 'chef_shadow', { w: 80, h: 36, ox: 40, oy: 18 }, pen(drawShadow));
  makeTex(scene, 'chef_shoe', { w: 24, h: 16 }, pen(drawShoe));
  // R25: the colour ring on the floor around each chef's feet (white with a dark edge, tinted per chef)
  makeTex(scene, 'chef_ring', { w: 100, h: 48, ox: 50, oy: 24 }, (c) => {
    c.lineWidth = 10;
    c.strokeStyle = '#000';
    c.globalAlpha = 0.55;
    c.beginPath();
    c.ellipse(0, 0, 35, 12.5, 0, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
    c.lineWidth = 5.5;
    c.strokeStyle = '#fff';
    c.beginPath();
    c.ellipse(0, 0, 35, 12.5, 0, 0, Math.PI * 2);
    c.stroke();
  });
  SKINS.forEach((s, i) =>
    makeTex(
      scene,
      `chef_arm_${i}`,
      { w: 24, h: 48, ox: 12, oy: 9 },
      pen((c) => drawArm(c, s)),
    ),
  );
  for (let i = 0; i < 8; i++) {
    makeTex(
      scene,
      `chef_body_${i}`,
      BOX,
      pen((c) => drawBody(c, i)),
    );
    makeTex(
      scene,
      `chef_bodyb_${i}`,
      BOX,
      pen((c) => drawBodyBack(c, i)),
    );
    makeTex(
      scene,
      `chef_head_${i}`,
      BOX,
      pen((c) => drawHead(c, i)),
    );
    makeTex(
      scene,
      `chef_headb_${i}`,
      BOX,
      pen((c) => drawHeadBack(c, i)),
    );
    makeTex(
      scene,
      `chef_fa_${i}`,
      BOX,
      pen((c) => drawFaceA(c, i)),
    );
    makeTex(
      scene,
      `chef_fb_${i}`,
      BOX,
      pen((c) => drawFaceB(c, i)),
    );
    makeTex(
      scene,
      `chef_hat_${i}`,
      BOX,
      pen((c) => drawHat(c, i)),
    );
    makeTex(
      scene,
      `chef_prop_${i}`,
      { w: 120, h: 250, ox: 60, oy: 230 },
      pen((c) => drawPropStem(c, i)),
    ); // Ayudante (taller than the chef box: the beanie rides above the hat)
  }
  makeTex(scene, 'chef_blades', { w: 84, h: 30 }, pen(drawPropBlades));
  for (const k of ['open', 'happy', 'x'] as const)
    makeTex(
      scene,
      `chef_eye_${k}`,
      { w: 16, h: 16 },
      pen((c) => drawEye(c, k)),
    );
  for (const k of ['smile', 'open', 'worry'] as const)
    makeTex(
      scene,
      `chef_mouth_${k}`,
      { w: 24, h: 20 },
      pen((c) => drawMouth(c, k)),
    );
  makeTex(scene, 'chef_drop', { w: 16, h: 20 }, pen(drawDrop));
}

// Portrait for DOM: chef from the waist up (or whole), as a canvas element.
/** The Ayudante sticker for the lobby chips (a 44 px round badge with the propeller). */
export const assistBadgeCanvas = (): HTMLCanvasElement => domCanvas(44, 44, 22, 22, pen(drawAssistBadge), 2);

export function chefCanvas(slot: number, mood: 'idle' | 'happy' = 'idle', whole = true): HTMLCanvasElement {
  return whole
    ? domCanvas(
        120,
        170,
        60,
        150,
        pen((c) => drawChefStatic(c, slot, mood)),
        2,
      )
    : domCanvas(
        110,
        108,
        55,
        106,
        pen((c) => {
          c.translate(0, 38);
          drawChefStatic(c, slot, mood);
        }),
        2,
      );
}

const plateCache = new Set<string>();

const FONT_PLATE = '800 17px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';

export function plateKey(scene: Phaser.Scene, slot: number, name: string): string {
  const short = name.length > 9 ? `${name.slice(0, 8)}.` : name;
  const key = `plate_${slot}_${short}`;
  if (plateCache.has(key) && scene.textures.exists(key)) return key;
  plateCache.add(key);
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = FONT_PLATE;
  const tw = Math.ceil(m.measureText(short).width);
  const w = tw + 44,
    h = 28;
  const ch = chefOf(slot);
  makeTex(scene, key, { w: w + 8, h: h + 10, ox: (w + 8) / 2, oy: h / 2 + 3 }, (c: Ctx) => {
    c.save();
    c.translate(-w / 2, -h / 2);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    rr(c, 1, 4, w, h, 14);
    c.fill();
    rr(c, 0, 0, w, h, 14);
    c.fillStyle = ch.color;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = C.ink;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    rr(c, 6, 3, w - 12, 5, 2.5);
    c.fill();
    c.beginPath();
    c.arc(14, h / 2, 10.5, 0, Math.PI * 2);
    c.fillStyle = C.cream;
    c.fill();
    c.lineWidth = 2.5;
    c.stroke();
    c.font = FONT_PLATE;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.fillStyle = C.ink;
    c.fillText(String((slot % 8) + 1), 14, h / 2 + 1);
    c.textAlign = 'left';
    c.lineWidth = 4;
    c.strokeStyle = C.ink;
    c.strokeText(short, 30, h / 2 + 1);
    c.fillStyle = '#fff';
    c.fillText(short, 30, h / 2 + 1);
    c.restore();
  });
  return key;
}
