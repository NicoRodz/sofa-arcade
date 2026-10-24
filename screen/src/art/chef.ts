// The eight pizzaiolos: part textures plus a procedural rig (squash & stretch, walk bounce, chop, carry, expressions).
import Phaser from 'phaser';
import type { Item } from '@party/shared/game';
import { C, TILE, U, chefOf, SKINS } from './tokens';
import { R, domCanvas, makeTex, rr, texSize, type Ctx } from './gfx';
import {
  HEAD_Y, MOUTH_DY, drawArm, drawBody, drawBodyBack, drawChefStatic, drawDrop, drawEye, drawFaceA, drawFaceB, drawHat,
  drawHead, drawHeadBack, drawMouth, drawShadow, drawShoe,
} from './chefdraw';
import { foodKey, ITEM_KIND } from './food';

export const CHEF_SCALE = 1.05;
const ITEM_SCALE = 0.72;
const BOX = { w: 120, h: 170, ox: 60, oy: 150 };

export function buildChefTextures(scene: Phaser.Scene) {
  makeTex(scene, 'chef_shadow', { w: 80, h: 36, ox: 40, oy: 18 }, drawShadow);
  makeTex(scene, 'chef_shoe', { w: 24, h: 16 }, drawShoe);
  SKINS.forEach((s, i) => makeTex(scene, `chef_arm_${i}`, { w: 24, h: 48, ox: 12, oy: 9 }, (c) => drawArm(c, s)));
  for (let i = 0; i < 8; i++) {
    makeTex(scene, `chef_body_${i}`, BOX, (c) => drawBody(c, i));
    makeTex(scene, `chef_bodyb_${i}`, BOX, (c) => drawBodyBack(c, i));
    makeTex(scene, `chef_head_${i}`, BOX, (c) => drawHead(c, i));
    makeTex(scene, `chef_headb_${i}`, BOX, (c) => drawHeadBack(c, i));
    makeTex(scene, `chef_fa_${i}`, BOX, (c) => drawFaceA(c, i));
    makeTex(scene, `chef_fb_${i}`, BOX, (c) => drawFaceB(c, i));
    makeTex(scene, `chef_hat_${i}`, BOX, (c) => drawHat(c, i));
  }
  for (const k of ['open', 'happy', 'x'] as const) makeTex(scene, `chef_eye_${k}`, { w: 16, h: 16 }, (c) => drawEye(c, k));
  for (const k of ['smile', 'open', 'worry'] as const) makeTex(scene, `chef_mouth_${k}`, { w: 24, h: 20 }, (c) => drawMouth(c, k));
  makeTex(scene, 'chef_drop', { w: 16, h: 20 }, drawDrop);
}

// Portrait for DOM: chef from the waist up (or whole), as a canvas element.
export function chefCanvas(slot: number, mood: 'idle' | 'happy' = 'idle', whole = true): HTMLCanvasElement {
  return whole
    ? domCanvas(120, 170, 60, 150, (c) => drawChefStatic(c, slot, mood), 2)
    : domCanvas(110, 108, 55, 106, (c) => { c.translate(0, 38); drawChefStatic(c, slot, mood); }, 2);
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
  const w = tw + 44, h = 28;
  const ch = chefOf(slot);
  makeTex(scene, key, { w: w + 8, h: h + 10, ox: (w + 8) / 2, oy: h / 2 + 3 }, (c: Ctx) => {
    c.save(); c.translate(-w / 2, -h / 2);
    c.fillStyle = 'rgba(0,0,0,0.25)'; rr(c, 1, 4, w, h, 14); c.fill();
    rr(c, 0, 0, w, h, 14); c.fillStyle = ch.color; c.fill(); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)'; rr(c, 6, 3, w - 12, 5, 2.5); c.fill();
    c.beginPath(); c.arc(14, h / 2, 10.5, 0, Math.PI * 2); c.fillStyle = C.cream; c.fill(); c.lineWidth = 2.5; c.stroke();
    c.font = FONT_PLATE; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillStyle = C.ink; c.fillText(String((slot % 8) + 1), 14, h / 2 + 1);
    c.textAlign = 'left'; c.lineWidth = 4; c.strokeStyle = C.ink; c.strokeText(short, 30, h / 2 + 1); c.fillStyle = '#fff'; c.fillText(short, 30, h / 2 + 1);
    c.restore();
  });
  return key;
}

export interface ChefState {
  x: number; y: number; // feet, logical px
  fx: number; fy: number;
  item: Item | null;
  action: 'none' | 'chop' | 'stretch';
  connected: boolean;
}

type Face = 'down' | 'side' | 'up';
const HOUR = Math.PI;

export class Chef {
  readonly root: Phaser.GameObjects.Container;
  onHit?: (kind: 'chop' | 'stretch') => void;
  private rig: Phaser.GameObjects.Container;
  private torso: Phaser.GameObjects.Image;
  private torsoB: Phaser.GameObjects.Image;
  private head: Phaser.GameObjects.Container;
  private headF: Phaser.GameObjects.Image;
  private headB: Phaser.GameObjects.Image;
  private fa: Phaser.GameObjects.Image;
  private fb: Phaser.GameObjects.Image;
  private eyes: Phaser.GameObjects.Image[];
  private mouth: Phaser.GameObjects.Image;
  private drop: Phaser.GameObjects.Image;
  private feet: Phaser.GameObjects.Image[];
  private arms: Phaser.GameObjects.Image[];
  private itemImg: Phaser.GameObjects.Image;
  private tag: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private lx = NaN; private ly = NaN;
  private phase = 0; private breath = 0; private hitT = 0; private wasMoving = false; private flip = 1;
  private sx = 0; private sy = 0; private vx = 0; private vy = 0; // scale spring
  private jumpT = 1; private happyT = 0; private failT = 0; private blinkT = 2 + Math.random() * 3; private blinkOn = 0;
  private face: Face = 'down';
  private tagKey: string;

  constructor(private scene: Phaser.Scene, readonly slot: number, name: string) {
    const skin = ((slot % 4) + 4) % 4;
    const at = (key: string, x = 0, y = 0) => {
      const t = texSize(key)!;
      return scene.add.image(x, y, key).setOrigin(t.ox / t.w, t.oy / t.h).setScale(1 / R);
    };
    this.shadow = at('chef_shadow');
    this.feet = [at('chef_shoe', -10, -3), at('chef_shoe', 10, -3)];
    this.arms = [at(`chef_arm_${skin}`, -25, -41), at(`chef_arm_${skin}`, 25, -41)];
    this.torso = at(`chef_body_${slot % 8}`);
    this.torsoB = at(`chef_bodyb_${slot % 8}`).setVisible(false);
    this.itemImg = at(foodKey('dough_raw'), 20, -44).setVisible(false).setScale(ITEM_SCALE / R);
    this.headF = at(`chef_head_${slot % 8}`);
    this.headB = at(`chef_headb_${slot % 8}`).setVisible(false);
    this.fa = at(`chef_fa_${slot % 8}`);
    this.eyes = [at('chef_eye_open', -7, HEAD_Y - 2), at('chef_eye_open', 7, HEAD_Y - 2)];
    this.mouth = at('chef_mouth_smile', 0, HEAD_Y + MOUTH_DY);
    this.fb = at(`chef_fb_${slot % 8}`);
    this.drop = at('chef_drop', 17, HEAD_Y - 6).setVisible(false);
    const hat = at(`chef_hat_${slot % 8}`);
    this.head = scene.add.container(0, 0, [this.headB, this.headF, this.fa, ...this.eyes, this.mouth, this.fb, this.drop, hat]);
    this.rig = scene.add.container(0, 0, [...this.feet, this.torsoB, this.torso, ...this.arms, this.itemImg, this.head]);
    this.tagKey = plateKey(scene, slot, name);
    this.tag = at(this.tagKey, 0, 20);
    this.root = scene.add.container(0, 0, [this.shadow, this.rig, this.tag]);
    this.root.setScale(U * CHEF_SCALE);
  }

  setName(name: string) {
    const k = plateKey(this.scene, this.slot, name);
    if (k !== this.tagKey) { this.tagKey = k; this.tag.setTexture(k); }
  }
  celebrate() { this.happyT = 900; this.jumpT = 0; }
  fail() { this.failT = 700; }
  bump() { this.sx = 0.08; this.sy = -0.08; this.vx = 0; this.vy = 0; }
  destroy() { this.root.destroy(); }

  update(dtMs: number, s: ChefState) {
    const dt = Math.min(dtMs, 50) / 1000;
    const dxp = Number.isNaN(this.lx) ? 0 : s.x - this.lx, dyp = Number.isNaN(this.ly) ? 0 : s.y - this.ly;
    this.lx = s.x; this.ly = s.y;
    const speed = dt > 0 ? Math.hypot(dxp, dyp) / dt / TILE : 0;
    const moving = speed > 0.7 && s.action === 'none';

    // facing
    const ax = Math.abs(s.fx), ay = Math.abs(s.fy);
    if (ay > ax * 1.3) this.face = s.fy < 0 ? 'up' : 'down';
    else { this.face = 'side'; if (Math.abs(s.fx) > 0.05) this.flip = s.fx < 0 ? -1 : 1; }
    const len = Math.hypot(s.fx, s.fy) || 1;

    // walk cycle
    if (moving) this.phase += dt * (HOUR / 0.14) * Math.min(1.15, Math.max(0.5, speed / 4.5));
    else this.phase = 0;
    if (this.wasMoving && !moving && s.action === 'none') { this.sx = 0.12; this.sy = -0.1; this.vx = 0; this.vy = 0; }
    if (!this.wasMoving && moving) { this.sx = -0.05; this.sy = 0.07; this.vx = 0; this.vy = 0; }
    this.wasMoving = moving;
    const bounce = moving ? Math.abs(Math.sin(this.phase)) * 6 : 0;
    const lean = moving ? Math.sin(this.phase / 2) * 6 * (HOUR / 180) : 0;

    // spring toward rest scale
    const k = 420, cdamp = 15;
    this.vx += (-k * this.sx - cdamp * this.vx) * dt; this.sx += this.vx * dt;
    this.vy += (-k * this.sy - cdamp * this.vy) * dt; this.sy += this.vy * dt;

    // idle breathing
    this.breath += dt * ((HOUR * 2) / 0.9);
    const br = moving ? 0 : (0.5 - 0.5 * Math.cos(this.breath)) * 0.03;

    // jump on delivery
    let jump = 0;
    if (this.jumpT < 1) { this.jumpT = Math.min(1, this.jumpT + dtMs / 220); jump = 24 * 4 * this.jumpT * (1 - this.jumpT); }
    this.happyT = Math.max(0, this.happyT - dtMs);
    this.failT = Math.max(0, this.failT - dtMs);

    // action loops
    let armA = 0, armB = 0, armsLen = [1, 1];
    const carrying = !!s.item;
    const rest = [0.14, -0.14];
    if (s.action === 'chop') {
      this.hitT += dtMs;
      const cyc = (this.hitT % 240) / 240;
      const down = cyc < 0.5 ? cyc * 2 : 1 - (cyc - 0.5) * 2; // 0 raised .. 1 down
      armB = -2.3 + 1.9 * down; armA = rest[0]!;
      const prev = ((this.hitT - dtMs) % 240) / 240;
      if (prev < 0.5 && cyc >= 0.5) { this.onHit?.('chop'); this.sx = 0.05; this.sy = -0.05; this.vx = 0; this.vy = 0; }
      if (carrying) { armA = -1.1; armsLen = [0.7, 1]; }
    } else if (s.action === 'stretch') {
      this.hitT += dtMs;
      const cyc = (this.hitT % 360) / 360;
      const push = 0.5 - 0.5 * Math.cos(cyc * HOUR * 2);
      armA = -(0.45 + 0.75 * push); armB = 0.45 + 0.75 * push; armsLen = [0.85 - 0.15 * push, 0.85 - 0.15 * push];
      const prev = ((this.hitT - dtMs) % 360) / 360;
      if (prev < 0.5 && cyc >= 0.5) { this.onHit?.('stretch'); this.sx = 0.04; this.sy = -0.05; this.vx = 0; this.vy = 0; }
    } else {
      this.hitT = 0;
      const sw = moving ? Math.sin(this.phase / 2) * 0.45 : 0;
      armA = rest[0]! + sw; armB = rest[1]! + sw;
      if (carrying) {
        if (this.face === 'side') { armA = -1.05; armB = -1.3; armsLen = [0.7, 0.55]; } else { armA = -1.2; armB = 1.2; armsLen = [0.62, 0.62]; }
      }
    }
    const [aL, aR] = this.arms as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    aL.setRotation(armA).setScale(1 / R, (armsLen[0] ?? 1) / R);
    aR.setRotation(armB).setScale(1 / R, (armsLen[1] ?? 1) / R);

    // feet
    this.feet[0]!.y = -3 + (moving ? Math.sin(this.phase / 2) * 3 : 0);
    this.feet[1]!.y = -3 - (moving ? Math.sin(this.phase / 2) * 3 : 0);

    // rig transform
    this.rig.setPosition(0, -bounce - jump);
    this.rig.setRotation(lean);
    this.rig.setScale(this.flip * (1 + this.sx - br * 0.3), 1 + this.sy + br);
    this.shadow.setScale((1 / R) * (1 - bounce * 0.02 - jump * 0.012), (1 / R) * (1 - bounce * 0.02));
    this.shadow.setAlpha(1 - jump * 0.015);

    // body / head orientation
    const up = this.face === 'up';
    this.torso.setVisible(!up); this.torsoB.setVisible(up);
    this.headF.setVisible(!up); this.headB.setVisible(up);
    for (const o of [this.fa, this.fb, this.mouth, ...this.eyes]) o.setVisible(!up);
    // carried item
    if (s.item) {
      this.itemImg.setVisible(true).setTexture(foodKey(ITEM_KIND[s.item]));
      const side = this.face === 'side';
      this.itemImg.setPosition(side ? 21 : up ? 20 : 0, up ? -46 : -43);
    } else this.itemImg.setVisible(false);

    // head: bob and shake
    let headDx = 0;
    if (this.failT > 0) headDx = Math.sin(this.failT / 14) * 4 * Math.min(1, this.failT / 300);
    this.head.setPosition(headDx, moving ? -Math.abs(Math.sin(this.phase + 0.6)) * 1.2 : -br * 46);

    // face
    const look = this.face === 'side' ? 4 : this.face === 'down' ? Math.max(-4, Math.min(4, (s.fx / len) * 4)) * this.flip : 0;
    const lookY = this.face === 'down' ? 1.5 : 0;
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkOn = 0.12; this.blinkT = 2.5 + Math.random() * 3.5; }
    this.blinkOn = Math.max(0, this.blinkOn - dt);
    const happy = this.happyT > 0, fail = this.failT > 0;
    const eyeKey = fail ? 'chef_eye_x' : happy ? 'chef_eye_happy' : 'chef_eye_open';
    this.eyes.forEach((e, i) => {
      if (e.texture.key !== eyeKey) e.setTexture(eyeKey);
      e.setPosition((i ? 7 : -7) + look, HEAD_Y - 2 + lookY).setScale(1 / R, (this.blinkOn > 0 && eyeKey === 'chef_eye_open' ? 0.12 : 1) / R);
    });
    const mouthKey = happy ? 'chef_mouth_open' : fail ? 'chef_mouth_worry' : 'chef_mouth_smile';
    if (this.mouth.texture.key !== mouthKey) this.mouth.setTexture(mouthKey);
    this.mouth.setPosition(look * 0.6, HEAD_Y + MOUTH_DY + lookY * 0.6);
    this.drop.setVisible(fail).setPosition(18 + look * 0.3, HEAD_Y - 8 + (700 - this.failT) * 0.014);

    // world placement
    this.root.setPosition(s.x, s.y);
    this.root.setDepth(100 + s.y);
    this.root.setAlpha(s.connected ? 1 : 0.35);
    this.tag.setDepth(0);
  }
}

