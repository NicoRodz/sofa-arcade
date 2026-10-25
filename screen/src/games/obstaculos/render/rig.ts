// The explorers: the pizzaiolos' procedural rig (art/chefdraw parts) with a climbing helmet and a harness instead of the toque and
// the apron look, and poses driven by the physics state (run, jump, land, hang, planted, carrying, carried, thrown, bubble, cheer).
import type Phaser from 'phaser';
import { C, CHEFS, SKINS, chefOf } from '../../../art/tokens';
import { HEAD_Y, MOUTH_DY, drawBody, drawBodyBack, } from '../../../art/chefdraw';
import { buildChefTextures } from '../../../art/chef';
import { R, makeTex, texSize, type Ctx } from '../../../art/gfx';
import { circle, drawOutlined, mix, rr, shade, vgrad } from '../../../art/gfx';
import { INK } from './biome';
import type { HandAction, PlayerView } from './view';

export const RIG_SCALE = 0.5; // design units -> world px. Chef is 90 units from feet to crown: ~45 px, the hitbox height
const BOX = { w: 120, h: 170, ox: 60, oy: 150 };
const WEBBING = '#33485C', WEBBING_LIGHT = '#566E85';

function harness(c: Ctx) {
  // chest strap from the left shoulder to the right hip, a second one crossing it, and a waist belt with a carabiner
  c.lineCap = 'round';
  for (const [w, col] of [[8.5, INK], [4.6, WEBBING]] as const) {
    c.strokeStyle = col; c.lineWidth = w;
    c.beginPath(); c.moveTo(-14, -48); c.lineTo(15, -10); c.stroke();
    c.beginPath(); c.moveTo(14, -48); c.lineTo(-15, -10); c.stroke();
  }
  c.strokeStyle = WEBBING_LIGHT; c.lineWidth = 1; c.setLineDash([2, 3]);
  c.beginPath(); c.moveTo(-14, -48); c.lineTo(15, -10); c.moveTo(14, -48); c.lineTo(-15, -10); c.stroke(); c.setLineDash([]);
  drawOutlined(c, () => rr(c, -23, -14, 46, 9, 3), vgrad(c, -14, -5, WEBBING_LIGHT, WEBBING), { lw: 2.5 });
  drawOutlined(c, () => rr(c, -6, -15.5, 12, 12, 3), '#E8B93C', { lw: 2.2 });
  c.fillStyle = INK; c.fillRect(-2.2, -12, 4.4, 6);
  // carabiner
  c.strokeStyle = INK; c.lineWidth = 5.2; c.beginPath(); c.ellipse(15, -9, 4.2, 6.2, 0.2, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#D9DEE2'; c.lineWidth = 2.4; c.stroke();
}
function harnessBack(c: Ctx) {
  c.lineCap = 'round';
  for (const [w, col] of [[8.5, INK], [4.6, WEBBING]] as const) {
    c.strokeStyle = col; c.lineWidth = w;
    c.beginPath(); c.moveTo(-14, -48); c.lineTo(-4, -22); c.moveTo(14, -48); c.lineTo(4, -22); c.stroke();
  }
  drawOutlined(c, () => rr(c, -23, -14, 46, 9, 3), vgrad(c, -14, -5, WEBBING_LIGHT, WEBBING), { lw: 2.5 });
}

function drawHelmet(c: Ctx, slot: number) {
  const ch = chefOf(slot);
  const dome = () => { c.beginPath(); c.moveTo(-25, HEAD_Y - 8); c.bezierCurveTo(-27, HEAD_Y - 34, 27, HEAD_Y - 34, 25, HEAD_Y - 8); c.lineTo(-25, HEAD_Y - 8); c.closePath(); };
  drawOutlined(c, dome, vgrad(c, HEAD_Y - 32, HEAD_Y - 8, mix(ch.color, '#FFFFFF', 0.3), ch.color), { lw: 3 });
  c.save(); dome(); c.clip();
  c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(-4, HEAD_Y - 34, 8, 30); // centre stripe
  c.strokeStyle = ch.dark; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-14, HEAD_Y - 12); c.quadraticCurveTo(-12, HEAD_Y - 26, -6, HEAD_Y - 30); c.stroke();
  c.restore();
  drawOutlined(c, () => rr(c, -28, HEAD_Y - 11, 56, 7, 3.5), vgrad(c, HEAD_Y - 11, HEAD_Y - 4, mix(ch.color, '#000000', 0.05), ch.dark), { lw: 2.6 });
  // headlamp
  drawOutlined(c, circle(c, 0, HEAD_Y - 19, 5.6), '#FFE9A0', { lw: 2.2 });
  c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(-1.4, HEAD_Y - 20.4, 1.7, 0, 7); c.fill();
  if (ch.accessory === 'bow') { // the bow sits on the helmet
    const bx = 15, by = HEAD_Y - 30;
    drawOutlined(c, () => { c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 12, by - 8); c.lineTo(bx - 12, by + 8); c.closePath(); c.moveTo(bx, by); c.lineTo(bx + 12, by - 8); c.lineTo(bx + 12, by + 8); c.closePath(); }, '#FFFFFF', { lw: 2.5 });
    drawOutlined(c, circle(c, bx, by, 3.8), ch.dark, { lw: 2 });
  }
}

function drawBubble(c: Ctx) {
  const g = c.createRadialGradient(-10, -12, 4, 0, 0, 52);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.7, 'rgba(160,220,255,0.22)'); g.addColorStop(1, 'rgba(110,190,255,0.42)');
  c.beginPath(); c.arc(0, 0, 50, 0, Math.PI * 2); c.fillStyle = g; c.fill();
  c.lineWidth = 3.5; c.strokeStyle = 'rgba(43,27,23,0.75)'; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 40, Math.PI * 1.1, Math.PI * 1.42); c.stroke();
  c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 40, Math.PI * 1.52, Math.PI * 1.58); c.stroke();
}

function drawBadge(c: Ctx, slot: number) {
  const ch = chefOf(slot);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(1, 3, 14, 0, 7); c.fill();
  drawOutlined(c, circle(c, 0, 0, 14), ch.color, { lw: 3 });
  c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.ellipse(-3, -7, 7, 3, -0.3, 0, 7); c.fill();
  c.font = '800 17px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 4; c.strokeStyle = INK; c.strokeText(String(slot + 1), 0, 1); c.fillStyle = '#fff'; c.fillText(String(slot + 1), 0, 1);
}

// Little icons over the head: what B would do now.
function drawIcon(c: Ctx, kind: HandAction) {
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.arc(1, 3, 15, 0, 7); c.fill();
  drawOutlined(c, circle(c, 0, 0, 15), '#FFF4E0', { lw: 3 });
  c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
  switch (kind) {
    case 'anchor': c.beginPath(); c.arc(0, 1, 6, 0, 7); c.stroke(); c.fillStyle = '#B8C4CC'; c.beginPath(); c.arc(0, 1, 6, 0, 7); c.stroke(); break;
    case 'lift': c.beginPath(); c.moveTo(0, 7); c.lineTo(0, -6); c.moveTo(-6, 0); c.lineTo(0, -7); c.lineTo(6, 0); c.stroke(); break;
    case 'grab': c.beginPath(); c.roundRect(-6, -3, 12, 9, 3); c.stroke(); c.beginPath(); c.moveTo(-3, -3); c.lineTo(-3, -7); c.moveTo(1, -3); c.lineTo(1, -8); c.moveTo(5, -3); c.lineTo(5, -6); c.stroke(); break;
    case 'plant': c.beginPath(); c.moveTo(0, -7); c.lineTo(0, 5); c.moveTo(-6, 0); c.lineTo(0, 7); c.lineTo(6, 0); c.moveTo(-8, 8); c.lineTo(8, 8); c.stroke(); break;
    case 'throw': c.beginPath(); c.moveTo(-8, 5); c.quadraticCurveTo(-1, -12, 8, -3); c.moveTo(3, -7); c.lineTo(8, -3); c.lineTo(2, -1); c.stroke(); break;
    case 'release': c.beginPath(); c.moveTo(-6, -4); c.lineTo(6, 4); c.moveTo(6, -4); c.lineTo(-6, 4); c.stroke(); break;
    default: break;
  }
}

const ICONS: HandAction[] = ['anchor', 'lift', 'grab', 'plant', 'throw', 'release'];

export function buildRigTextures(scene: Phaser.Scene) {
  buildChefTextures(scene); // shoes, arms, eyes, mouths, heads, plates (the pizza rig parts)
  for (let i = 0; i < CHEFS.length; i++) {
    makeTex(scene, `ex_body_${i}`, BOX, (c) => { drawBody(c, i); harness(c); });
    makeTex(scene, `ex_bodyb_${i}`, BOX, (c) => { drawBodyBack(c, i); harnessBack(c); });
    makeTex(scene, `ex_helmet_${i}`, BOX, (c) => drawHelmet(c, i));
    makeTex(scene, `ex_badge_${i}`, { w: 40, h: 40 }, (c) => drawBadge(c, i));
  }
  makeTex(scene, 'ex_bubble', { w: 120, h: 120 }, drawBubble);
  for (const k of ICONS) makeTex(scene, `ex_icon_${k}`, { w: 40, h: 40 }, (c) => drawIcon(c, k));
  void SKINS; void shade; void C;
}

const PI = Math.PI;
const approach = (v: number, t: number, k: number) => v + (t - v) * Math.min(1, k);

export interface RigFrame { x: number; y: number; zoom: number; dt: number } // x, y: feet centre in world px (interpolated)

const SIGNAL_TEXT: Record<string, string> = { arrowL: '←', arrowR: '→', arrowU: '↑', arrowD: '↓', wait: '¡espera!', go: '¡ya!' };
export class Explorer {
  readonly root: Phaser.GameObjects.Container;
  private rig: Phaser.GameObjects.Container;
  private sigBg: Phaser.GameObjects.Graphics;
  private sigBox: Phaser.GameObjects.Container;
  private head: Phaser.GameObjects.Container;
  private torso: Phaser.GameObjects.Image;
  private torsoB: Phaser.GameObjects.Image;
  private headF: Phaser.GameObjects.Image;
  private headB: Phaser.GameObjects.Image;
  private eyes: Phaser.GameObjects.Image[];
  private mouth: Phaser.GameObjects.Image;
  private fa: Phaser.GameObjects.Image;
  private fb: Phaser.GameObjects.Image;
  private helmet: Phaser.GameObjects.Image;
  private feet: Phaser.GameObjects.Image[];
  private arms: Phaser.GameObjects.Image[];
  private bubble: Phaser.GameObjects.Image;
  private badge: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Image;
  private sig: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Image;
  // animation state
  private phase = 0; private sx = 0; private sy = 0; private vsx = 0; private vsy = 0; private lean = 0; private armsUp = 0;
  private crouch = 0; private spin = 0; private happyT = 0; private failT = 0; private blinkT = 1 + Math.random() * 3; private blinkOn = 0;
  private wasGrounded = true; private t = 0; private lastIcon: HandAction = 'none';

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, readonly slot: number) {
    const i = slot % 8, skin = slot % 4;
    const at = (key: string, x = 0, y = 0) => { const t = texSize(key)!; return scene.add.image(x, y, key).setOrigin(t.ox / t.w, t.oy / t.h).setScale(1 / R); };
    this.shadow = at('chef_shadow');
    this.feet = [at('chef_shoe', -10, -3), at('chef_shoe', 10, -3)];
    this.arms = [at(`chef_arm_${skin}`, -25, -41), at(`chef_arm_${skin}`, 25, -41)];
    this.torso = at(`ex_body_${i}`);
    this.torsoB = at(`ex_bodyb_${i}`).setVisible(false);
    this.headF = at(`chef_head_${i}`);
    this.headB = at(`chef_headb_${i}`).setVisible(false);
    this.fa = at(`chef_fa_${i}`);
    this.eyes = [at('chef_eye_open', -7, HEAD_Y - 2), at('chef_eye_open', 7, HEAD_Y - 2)];
    this.mouth = at('chef_mouth_smile', 0, HEAD_Y + MOUTH_DY);
    this.fb = at(`chef_fb_${i}`);
    this.helmet = at(`ex_helmet_${i}`);
    this.head = scene.add.container(0, 0, [this.headB, this.headF, this.fa, ...this.eyes, this.mouth, this.fb, this.helmet]);
    this.rig = scene.add.container(0, 0, [...this.feet, this.torsoB, this.torso, ...this.arms, this.head]);
    this.bubble = at('ex_bubble', 0, -50).setVisible(false);
    this.badge = at(`ex_badge_${i}`, 0, -122);
    this.icon = at('ex_icon_grab', 0, -158).setVisible(false);
    // campaign signals: a speech bubble (cream, inked, with a tail) around a big arrow or word, drawn in the text's own pixels (the box is scaled like the badge)
    this.sigBg = scene.add.graphics();
    this.sig = scene.add.text(0, -26, '', { fontFamily: 'ui-rounded, system-ui, sans-serif', fontSize: '84px', fontStyle: '800', color: '#2B1B17' }).setOrigin(0.5, 1);
    this.sigBox = scene.add.container(0, -170, [this.sigBg, this.sig]).setVisible(false);
    this.root = scene.add.container(0, 0, [this.shadow, this.rig]);
    this.root.setScale(RIG_SCALE);
    // badge, icon and bubble live outside the scaled rig so they keep a constant on-screen size
    this.root.add([this.bubble, this.badge, this.icon, this.sigBox]);
    layer.add(this.root);
  }

  celebrate() { this.happyT = 1.2; }
  fail() { this.failT = 0.7; }
  squash(amount: number) { this.sx = 0.22 * amount; this.sy = -0.24 * amount; this.vsx = 0; this.vsy = 0; }
  stretch(amount: number) { this.sx = -0.16 * amount; this.sy = 0.2 * amount; this.vsx = 0; this.vsy = 0; }
  destroy() { this.root.destroy(); }

  update(p: PlayerView, f: RigFrame) {
    const dt = Math.min(f.dt, 0.05);
    this.t += dt;
    const speed = Math.abs(p.vx);
    const bubble = p.bubble;
    const air = !p.grounded && !p.hanging && !p.anchored && !p.thrown && !bubble;
    const running = p.grounded && speed > 40 && !p.planted;

    // squash spring
    const k = 420, d = 15;
    this.vsx += (-k * this.sx - d * this.vsx) * dt; this.sx += this.vsx * dt;
    this.vsy += (-k * this.sy - d * this.vsy) * dt; this.sy += this.vsy * dt;
    if (!this.wasGrounded && p.grounded && !bubble) this.squash(Math.min(1, Math.abs(p.vy) / 700 + 0.35));
    this.wasGrounded = p.grounded;

    if (running) this.phase += dt * (6 + speed / 330 * 9);
    else this.phase = approach(this.phase, Math.round(this.phase / PI) * PI, dt * 12);
    const stride = Math.sin(this.phase);
    const bounce = running ? Math.abs(Math.cos(this.phase)) * 3.2 / RIG_SCALE * 0.5 : 0;

    // target pose
    let armL = 0.16, armR = -0.16, armLen = 1, lean = 0, crouch = 0, up = 0;
    let stretchY = 0, stretchX = 0;
    const carrying = p.holding === 'player' || p.holding === 'box';
    if (bubble) { armL = PI - 0.5; armR = -(PI - 0.5); up = 1; }
    else if (p.holding === 'player') { armL = PI - 0.18; armR = -(PI - 0.18); up = 1; }
    else if (p.carriedBy >= 0) { armL = PI - 0.7; armR = -(PI - 0.7); up = 0.6; }
    else if (p.thrown) { armL = PI * 0.6; armR = -PI * 0.6; }
    else if (p.hanging || p.anchored) { armL = PI - 0.14; armR = -(PI - 0.14); up = 1; }
    else if (p.planted) { crouch = 1; armL = 0.9; armR = -0.9; }
    else if (p.holding === 'box') { armL = -1.5; armR = 1.5; armLen = 0.7; }
    else if (air) {
      const rising = p.vy < -60;
      armL = rising ? PI - 0.9 : 1.1; armR = rising ? -(PI - 0.9) : -1.1; up = rising ? 0.7 : 0.2;
      stretchY = rising ? 0.12 : 0.05; stretchX = rising ? -0.1 : -0.04;
    } else if (running) { armL = 0.16 + stride * 0.9; armR = -0.16 + stride * 0.9; lean = 0.1 * Math.sign(p.vx) * Math.min(1, speed / 330); }
    else if (p.inGoal || this.happyT > 0) { armL = PI - 0.6; armR = -(PI - 0.6); up = 1; }
    void carrying;
    this.armsUp = approach(this.armsUp, up, dt * 14);
    this.crouch = approach(this.crouch, crouch, dt * 16);
    this.lean = approach(this.lean, lean, dt * 10);
    this.happyT = Math.max(0, this.happyT - dt);
    this.failT = Math.max(0, this.failT - dt);

    const [aL, aR] = this.arms as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    aL.setRotation(armL).setScale(1 / R, armLen / R);
    aR.setRotation(armR).setScale(1 / R, armLen / R);
    // feet: stride on the ground, dangle in the air, spread when planted
    const foot = (idx: 0 | 1, sign: number) => {
      const fx = sign * (10 + this.crouch * 7), base = -3;
      let fy = base;
      if (running) fy = base - Math.max(0, Math.sin(this.phase + (idx ? PI : 0))) * 6;
      else if (air) fy = base - 5 + (idx ? 2 : -1);
      else if (p.hanging || p.anchored || p.carriedBy >= 0) fy = base + 4 + Math.sin(this.t * 6 + idx * 2) * 2;
      this.feet[idx]!.setPosition(fx, fy);
    };
    foot(0, -1); foot(1, 1);

    // rig transform
    let rot = this.lean;
    if (p.thrown) { this.spin += dt * 14 * (p.vx >= 0 ? 1 : -1); rot = this.spin; } else this.spin = approach(this.spin, 0, dt * 8);
    if (p.hanging && !p.anchored) rot = Math.sin(this.t * 3.2) * 0.07;
    const sxT = 1 + this.sx + stretchX + this.crouch * 0.12, syT = 1 + this.sy + stretchY - this.crouch * 0.12;
    const bob = bubble ? Math.sin(this.t * 3) * 3 : p.inGoal ? Math.abs(Math.sin(this.t * 7)) * 4 : 0;
    const lift = p.hanging ? 6 : 0;
    // a thrown body tumbles around its centre, not around its feet
    const cy = -50;
    const px = p.thrown ? cy * Math.sin(rot) : 0, py = p.thrown ? cy * (1 - Math.cos(rot)) : 0; // offset = c - R(rot) c
    this.rig.setPosition(px, -bounce * 2 - bob - lift + this.crouch * 4 + py);
    this.rig.setRotation(rot);
    this.rig.setScale(p.facing * sxT, syT);
    this.shadow.setVisible(p.grounded && !bubble).setScale(1 / R * 1.1, 1 / R);

    // head orientation: always front
    this.torso.setVisible(true); this.torsoB.setVisible(false);
    // face
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkOn = 0.12; this.blinkT = 2.5 + Math.random() * 3.5; }
    this.blinkOn = Math.max(0, this.blinkOn - dt);
    const scared = bubble || p.carriedBy >= 0 || p.thrown || p.hanging || this.failT > 0;
    const happy = this.happyT > 0 || p.inGoal;
    const eyeKey = this.failT > 0 ? 'chef_eye_x' : happy ? 'chef_eye_happy' : 'chef_eye_open';
    this.eyes.forEach((e, idx) => {
      if (e.texture.key !== eyeKey) e.setTexture(eyeKey);
      e.setPosition((idx ? 7 : -7) + 3.5, HEAD_Y - 2).setScale(1 / R, (this.blinkOn > 0 && eyeKey === 'chef_eye_open' ? 0.12 : 1) / R);
    });
    const mouthKey = happy ? 'chef_mouth_open' : scared || p.planted ? 'chef_mouth_worry' : air ? 'chef_mouth_open' : 'chef_mouth_smile';
    if (this.mouth.texture.key !== mouthKey) this.mouth.setTexture(mouthKey);
    this.mouth.setPosition(2, HEAD_Y + MOUTH_DY);

    // world placement
    this.root.setPosition(f.x, f.y);
    // bubble
    if (bubble) {
      const pop = bubble.phase === 'pop';
      const k2 = pop ? 1 + bubble.t * 2.2 : 1 + Math.sin(this.t * 5) * 0.04;
      this.bubble.setVisible(true).setScale((1 / R) * 1.5 * k2).setAlpha(pop ? Math.max(0, 1 - bubble.t / 0.4) : 0.95).setPosition(0, -52);
    } else this.bubble.setVisible(false);
    // number badge and hint icon keep their on-screen size whatever the zoom is
    const inv = Math.min(1.7, 1 / f.zoom);
    const counter = (1 / RIG_SCALE);
    this.badge.setScale((1 / R) * counter * 0.95 * inv).setPosition(0, -(56 + 16 * inv) * counter);
    // the idle "plant" hint is quiet (small, translucent, gone when zoomed far out); the others are what the player should notice
    const quiet = p.hint === 'plant';
    if (p.hint !== 'none' && !bubble && !(quiet && f.zoom < 0.75)) {
      if (p.hint !== this.lastIcon) { this.icon.setTexture(`ex_icon_${p.hint}`); this.lastIcon = p.hint; }
      this.icon.setVisible(true).setAlpha(quiet ? 0.55 : 1).setScale((1 / R) * counter * (quiet ? 0.62 : 0.9) * inv).setPosition(0, -(56 + (quiet ? 30 : 36) * inv) * counter - Math.sin(this.t * 5) * 2);
    } else this.icon.setVisible(false);

    // campaign signal (arrow, wait, go) above the head, on-screen size like the badge; it replaces the hint icon while it shows
    const sigText = p.signal ? SIGNAL_TEXT[p.signal] : '';
    if (sigText) {
      if (this.sig.text !== sigText) {
        this.sig.setText(sigText);
        const w = Math.max(this.sig.width + 56, 120), h = this.sig.height + 30, g = this.sigBg;
        g.clear();
        g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(-w / 2 - 7, -h - 24 - 7, w + 14, h + 14, 30); g.fillTriangle(-24, -24, 24, -24, 0, 10);
        g.fillStyle(0xfff4e0, 1); g.fillRoundedRect(-w / 2, -h - 24, w, h, 24); g.fillTriangle(-17, -26, 17, -26, 0, 2);
        this.sig.setPosition(0, -24 - 15);
      }
      this.sig.setColor(p.signal === 'go' ? '#2A7A36' : p.signal === 'wait' ? '#C62E22' : '#2B1B17');
      this.sigBox.setVisible(true).setScale((1 / R) * counter * 0.72 * inv * (1 + Math.sin(this.t * 14) * 0.03)).setPosition(0, -(62 + 24 * inv) * counter);
      this.icon.setVisible(false);
    } else this.sigBox.setVisible(false);

    // blink while invulnerable, dim if disconnected
    const inv2 = p.invulnSec > 0 && Math.floor(this.t * 14) % 2 === 0;
    this.root.setAlpha(!p.connected ? 0.35 : inv2 ? 0.45 : 1);
    this.root.setVisible(!p.dead);
  }
}
