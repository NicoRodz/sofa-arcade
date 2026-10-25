// The eight pizzaiolos: part textures plus a procedural rig (squash & stretch, walk bounce, chop, carry, expressions).
import type Phaser from 'phaser';
import type { Item } from '@pichi/game-pizzas/sim';
import { TILE, U, chefOf, hexNum } from '../tokens';
import { R, texSize } from '../gfx';
import { HEAD_Y, MOUTH_DY, PROP_Y, hatTop } from '../chefdraw';
import { foodKey, ITEM_KIND } from '@pichi/game-pizzas/screen/art/food';
import { CHEF_SCALE, ITEM_SCALE, plateKey } from './textures';

export interface ChefState {
  x: number;
  y: number; // feet, logical px
  fx: number;
  fy: number;
  item: Item | null;
  action: 'none' | 'chop' | 'stretch';
  connected: boolean;
  ghost?: boolean; // R4: crossing through another chef
  slipT?: number; // sabotage: ms since the chef slipped (-1 / absent: it is not slipping)
  slideMs?: number; // ... and how long the slide lasts (the spin follows it)
  immune?: boolean; // sabotage: rubbish cannot make it slip now (it blinks)
  assist?: boolean; // Ayudante: wears the propeller
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
  private ring: Phaser.GameObjects.Image;
  private teamRing?: Phaser.GameObjects.Image;
  private lx = NaN;
  private ly = NaN;
  private phase = 0;
  private breath = 0;
  private hitT = 0;
  private wasMoving = false;
  private flip = 1;
  private sx = 0;
  private sy = 0;
  private vx = 0;
  private vy = 0; // scale spring
  private jumpT = 1;
  private happyT = 0;
  private failT = 0;
  private blinkT = 2 + Math.random() * 3;
  private blinkOn = 0;
  private face: Face = 'down';
  private tagKey: string;
  private spinStars: Phaser.GameObjects.Image[]; // sabotage: three stars circling the head while the chef slips
  private prop: Phaser.GameObjects.Image; // Ayudante: the stalk on the hat
  private blades: Phaser.GameObjects.Image; // ... and the blades that spin
  private clock = 0;

  constructor(
    private scene: Phaser.Scene,
    readonly slot: number,
    name: string,
  ) {
    const skin = ((slot % 4) + 4) % 4;
    const at = (key: string, x = 0, y = 0) => {
      const t = texSize(key)!;
      return scene.add
        .image(x, y, key)
        .setOrigin(t.ox / t.w, t.oy / t.h)
        .setScale(1 / R);
    };
    this.shadow = at('chef_shadow');
    this.ring = at('chef_ring').setTint(hexNum(chefOf(slot).color));
    this.feet = [at('chef_shoe', -10, -3), at('chef_shoe', 10, -3)];
    this.arms = [at(`chef_arm_${skin}`, -25, -41), at(`chef_arm_${skin}`, 25, -41)];
    this.torso = at(`chef_body_${slot % 8}`);
    this.torsoB = at(`chef_bodyb_${slot % 8}`).setVisible(false);
    this.itemImg = at(foodKey('dough_raw'), 20, -44)
      .setVisible(false)
      .setScale(ITEM_SCALE / R);
    this.headF = at(`chef_head_${slot % 8}`);
    this.headB = at(`chef_headb_${slot % 8}`).setVisible(false);
    this.fa = at(`chef_fa_${slot % 8}`);
    this.eyes = [at('chef_eye_open', -7, HEAD_Y - 2), at('chef_eye_open', 7, HEAD_Y - 2)];
    this.mouth = at('chef_mouth_smile', 0, HEAD_Y + MOUTH_DY);
    this.fb = at(`chef_fb_${slot % 8}`);
    this.drop = at('chef_drop', 17, HEAD_Y - 6).setVisible(false);
    const hat = at(`chef_hat_${slot % 8}`);
    this.prop = at(`chef_prop_${slot % 8}`).setVisible(false);
    this.blades = at('chef_blades', 0, hatTop(slot) - PROP_Y).setVisible(false);
    this.head = scene.add.container(0, 0, [
      this.headB,
      this.headF,
      this.fa,
      ...this.eyes,
      this.mouth,
      this.fb,
      this.drop,
      hat,
      this.prop,
      this.blades,
    ]);
    this.rig = scene.add.container(0, 0, [...this.feet, this.torsoB, this.torso, ...this.arms, this.itemImg, this.head]);
    this.tagKey = plateKey(scene, slot, name);
    this.tag = at(this.tagKey, 0, 20);
    this.spinStars = [0, 1, 2].map(() =>
      scene.add
        .image(0, 0, 'fx_star')
        .setScale((0.9 / R) * 1.4)
        .setVisible(false),
    );
    this.root = scene.add.container(0, 0, [this.shadow, this.ring, this.rig, ...this.spinStars, this.tag]);
    this.root.setScale(U * CHEF_SCALE);
  }

  // Versus: a second, wider ring in the team's colour under the chef's own (the chef keeps its colour; the team is the ring).
  setTeam(color: number) {
    if (this.teamRing) {
      this.teamRing.setTint(color);
      return;
    }
    const t = texSize('chef_ring')!;
    this.teamRing = this.scene.add
      .image(0, 0, 'chef_ring')
      .setOrigin(t.ox / t.w, t.oy / t.h)
      .setScale(1.7 / R, 1.55 / R)
      .setTint(color);
    this.root.addAt(this.teamRing, 1);
  }
  setName(name: string) {
    const k = plateKey(this.scene, this.slot, name);
    if (k !== this.tagKey) {
      this.tagKey = k;
      this.tag.setTexture(k);
    }
  }
  celebrate() {
    this.happyT = 900;
    this.jumpT = 0;
  }
  fail() {
    this.failT = 700;
  }
  dash() {
    this.sx = 0.2;
    this.sy = -0.16;
    this.vx = 0;
    this.vy = 0;
  } // stretches along the run
  bump() {
    this.sx = 0.08;
    this.sy = -0.08;
    this.vx = 0;
    this.vy = 0;
  }
  destroy() {
    this.root.destroy();
  }

  update(dtMs: number, s: ChefState) {
    const dt = Math.min(dtMs, 50) / 1000;
    const dxp = Number.isNaN(this.lx) ? 0 : s.x - this.lx,
      dyp = Number.isNaN(this.ly) ? 0 : s.y - this.ly;
    this.lx = s.x;
    this.ly = s.y;
    const speed = dt > 0 ? Math.hypot(dxp, dyp) / dt / TILE : 0;
    const moving = speed > 0.7 && s.action === 'none';

    // facing
    const ax = Math.abs(s.fx),
      ay = Math.abs(s.fy);
    if (ay > ax * 1.3) this.face = s.fy < 0 ? 'up' : 'down';
    else {
      this.face = 'side';
      if (Math.abs(s.fx) > 0.05) this.flip = s.fx < 0 ? -1 : 1;
    }
    const len = Math.hypot(s.fx, s.fy) || 1;

    // walk cycle
    if (moving) this.phase += dt * (HOUR / 0.14) * Math.min(1.15, Math.max(0.5, speed / 4.5));
    else this.phase = 0;
    if (this.wasMoving && !moving && s.action === 'none') {
      this.sx = 0.12;
      this.sy = -0.1;
      this.vx = 0;
      this.vy = 0;
    }
    if (!this.wasMoving && moving) {
      this.sx = -0.05;
      this.sy = 0.07;
      this.vx = 0;
      this.vy = 0;
    }
    this.wasMoving = moving;
    const bounce = moving ? Math.abs(Math.sin(this.phase)) * 6 : 0;
    const lean = moving ? Math.sin(this.phase / 2) * 6 * (HOUR / 180) : 0;

    // spring toward rest scale
    const k = 420,
      cdamp = 15;
    this.vx += (-k * this.sx - cdamp * this.vx) * dt;
    this.sx += this.vx * dt;
    this.vy += (-k * this.sy - cdamp * this.vy) * dt;
    this.sy += this.vy * dt;

    // idle breathing
    this.breath += dt * ((HOUR * 2) / 0.9);
    const br = moving ? 0 : (0.5 - 0.5 * Math.cos(this.breath)) * 0.03;

    // jump on delivery
    let jump = 0;
    if (this.jumpT < 1) {
      this.jumpT = Math.min(1, this.jumpT + dtMs / 220);
      jump = 24 * 4 * this.jumpT * (1 - this.jumpT);
    }
    this.happyT = Math.max(0, this.happyT - dtMs);
    this.failT = Math.max(0, this.failT - dtMs);

    // action loops
    let armA = 0,
      armB = 0,
      armsLen = [1, 1];
    const carrying = !!s.item;
    const rest = [0.14, -0.14];
    if (s.action === 'chop') {
      this.hitT += dtMs;
      const cyc = (this.hitT % 240) / 240;
      const down = cyc < 0.5 ? cyc * 2 : 1 - (cyc - 0.5) * 2; // 0 raised .. 1 down
      armB = -2.3 + 1.9 * down;
      armA = rest[0]!;
      const prev = ((this.hitT - dtMs) % 240) / 240;
      if (prev < 0.5 && cyc >= 0.5) {
        this.onHit?.('chop');
        this.sx = 0.05;
        this.sy = -0.05;
        this.vx = 0;
        this.vy = 0;
      }
      if (carrying) {
        armA = -1.1;
        armsLen = [0.7, 1];
      }
    } else if (s.action === 'stretch') {
      this.hitT += dtMs;
      const cyc = (this.hitT % 360) / 360;
      const push = 0.5 - 0.5 * Math.cos(cyc * HOUR * 2);
      armA = -(0.45 + 0.75 * push);
      armB = 0.45 + 0.75 * push;
      armsLen = [0.85 - 0.15 * push, 0.85 - 0.15 * push];
      const prev = ((this.hitT - dtMs) % 360) / 360;
      if (prev < 0.5 && cyc >= 0.5) {
        this.onHit?.('stretch');
        this.sx = 0.04;
        this.sy = -0.05;
        this.vx = 0;
        this.vy = 0;
      }
    } else {
      this.hitT = 0;
      const sw = moving ? Math.sin(this.phase / 2) * 0.45 : 0;
      armA = rest[0]! + sw;
      armB = rest[1]! + sw;
      if (carrying) {
        if (this.face === 'side') {
          armA = -1.05;
          armB = -1.3;
          armsLen = [0.7, 0.55];
        } else {
          armA = -1.2;
          armB = 1.2;
          armsLen = [0.62, 0.62];
        }
      }
    }
    const [aL, aR] = this.arms as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    aL.setRotation(armA).setScale(1 / R, (armsLen[0] ?? 1) / R);
    aR.setRotation(armB).setScale(1 / R, (armsLen[1] ?? 1) / R);

    // feet
    this.feet[0]!.y = -3 + (moving ? Math.sin(this.phase / 2) * 3 : 0);
    this.feet[1]!.y = -3 - (moving ? Math.sin(this.phase / 2) * 3 : 0);

    // sabotage: a slip is two spins and flailing arms (the slide is the spin), then the chef gets up with a squash; the stars circle the head
    this.clock += dtMs;
    const slipT = s.slipT ?? -1,
      slipping = slipT >= 0;
    let spin = 0,
      slipSquash = 0;
    if (slipping) {
      const sl = s.slideMs ?? 600;
      spin = slipT < sl ? Math.min(1, slipT / sl) * Math.PI * 4 * this.flip : 0;
      slipSquash = slipT < sl ? -0.12 : -0.2 * (1 - Math.min(1, (slipT - sl) / 120)); // flat on the floor, then up
      aL.setRotation(-2.2 + Math.sin(this.clock / 45) * 0.9);
      aR.setRotation(2.2 - Math.sin(this.clock / 45) * 0.9);
      this.failT = Math.max(this.failT, 160);
    }
    this.spinStars.forEach((st, i) => {
      st.setVisible(slipping);
      if (slipping) {
        const a = this.clock / 110 + (i * Math.PI * 2) / 3;
        st.setPosition(Math.cos(a) * 26, HEAD_Y - 34 + Math.sin(a) * 7).setRotation(a * 2);
      }
    });

    // rig transform
    this.rig.setPosition(0, -bounce - jump + (slipping ? 8 : 0));
    this.rig.setRotation(lean + spin);
    this.rig.setScale(this.flip * (1 + this.sx - br * 0.3), 1 + this.sy + br + slipSquash);
    this.shadow.setScale((1 / R) * (1 - bounce * 0.02 - jump * 0.012), (1 / R) * (1 - bounce * 0.02));
    this.shadow.setAlpha(1 - jump * 0.015);

    // body / head orientation
    const up = this.face === 'up';
    this.torso.setVisible(!up);
    this.torsoB.setVisible(up);
    this.headF.setVisible(!up);
    this.headB.setVisible(up);
    for (const o of [this.fa, this.fb, this.mouth, ...this.eyes]) o.setVisible(!up);
    // carried item
    if (s.item) {
      this.itemImg.setVisible(true).setTexture(foodKey(ITEM_KIND[s.item]));
      const side = this.face === 'side';
      this.itemImg.setPosition(side ? 21 : up ? 20 : 0, up ? -46 : -43);
    } else this.itemImg.setVisible(false);

    // Ayudante: the propeller spins (the blades squash in x, as a disc seen from the front)
    this.prop.setVisible(!!s.assist);
    this.blades.setVisible(!!s.assist);
    if (s.assist) this.blades.setScale((0.3 + 0.7 * Math.abs(Math.cos(this.clock / 60))) / R, 1 / R);

    // head: bob and shake
    let headDx = 0;
    if (this.failT > 0) headDx = Math.sin(this.failT / 14) * 4 * Math.min(1, this.failT / 300);
    this.head.setPosition(headDx, moving ? -Math.abs(Math.sin(this.phase + 0.6)) * 1.2 : -br * 46);

    // face
    const look = this.face === 'side' ? 4 : this.face === 'down' ? Math.max(-4, Math.min(4, (s.fx / len) * 4)) * this.flip : 0;
    const lookY = this.face === 'down' ? 1.5 : 0;
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkOn = 0.12;
      this.blinkT = 2.5 + Math.random() * 3.5;
    }
    this.blinkOn = Math.max(0, this.blinkOn - dt);
    const happy = this.happyT > 0,
      fail = this.failT > 0;
    const eyeKey = fail ? 'chef_eye_x' : happy ? 'chef_eye_happy' : 'chef_eye_open';
    this.eyes.forEach((e, i) => {
      if (e.texture.key !== eyeKey) e.setTexture(eyeKey);
      e.setPosition((i ? 7 : -7) + look, HEAD_Y - 2 + lookY).setScale(
        1 / R,
        (this.blinkOn > 0 && eyeKey === 'chef_eye_open' ? 0.12 : 1) / R,
      );
    });
    const mouthKey = happy ? 'chef_mouth_open' : fail ? 'chef_mouth_worry' : 'chef_mouth_smile';
    if (this.mouth.texture.key !== mouthKey) this.mouth.setTexture(mouthKey);
    this.mouth.setPosition(look * 0.6, HEAD_Y + MOUTH_DY + lookY * 0.6);
    this.drop.setVisible(fail).setPosition(18 + look * 0.3, HEAD_Y - 8 + (700 - this.failT) * 0.014);

    // world placement
    this.root.setPosition(s.x, s.y);
    this.root.setDepth(100 + s.y);
    this.root.setAlpha((s.connected ? (s.ghost ? 0.6 : 1) : 0.35) * (s.immune ? (Math.sin(this.clock / 55) > 0 ? 1 : 0.45) : 1)); // immune after a slip: it blinks
    this.tag.setDepth(0);
  }
}
