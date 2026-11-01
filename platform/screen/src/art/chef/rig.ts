// The eight pizzaiolos: part textures plus a procedural rig (squash & stretch, walk bounce, chop, carry, expressions).
import type Phaser from 'phaser';
import { TILE, U, chefOf, hexNum } from '../tokens';
import { R, texSize } from '../gfx';
import { PROP_Y, hatTop } from '../chefdraw';
import { ANCHORS, CHOP_MS, HEAD_Y, MOUTH_DY, STRETCH_MS, armPose, eyeLook, facing, gait, itemAnchor } from '@pichi/core/avatar';
import { CHEF_SCALE, ITEM_SCALE, plateKey } from './textures';
import type { Appearance } from '@pichi/core/avatar';
import { lookTextures, type LookKeys } from './look';

/** What a chef carries is the game's business: `idle` is the texture the carried-item image is created with, `keyOf` the texture of an item. */
export interface HeldSkin {
  idle: string;
  keyOf(item: string): string;
}

export interface ChefState {
  x: number;
  y: number; // feet, logical px
  fx: number;
  fy: number;
  item: string | null;
  action: 'none' | 'chop' | 'stretch';
  connected: boolean;
  ghost?: boolean; // R4: crossing through another chef
  slipT?: number; // sabotage: ms since the chef slipped (-1 / absent: it is not slipping)
  slideMs?: number; // ... and how long the slide lasts (the spin follows it)
  immune?: boolean; // sabotage: rubbish cannot make it slip now (it blinks)
  assist?: boolean; // Ayudante: wears the propeller
  skate?: boolean; // on ice: no steps, arms out, leaning into the slide
  tagLift?: number; // logical px the name plate sits lower (two chefs on one tile stack their plates)
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
  private itemImg?: Phaser.GameObjects.Image; // only a chef built with a `held` skin carries anything
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
  private hat: Phaser.GameObjects.Image;
  private look: LookKeys | null = null; // set once the player's Appearance is known: the baked parts replace the slot's own
  private lookId = '';

  constructor(
    private scene: Phaser.Scene,
    readonly slot: number,
    name: string,
    private held?: HeldSkin,
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
    this.feet = [at('chef_shoe', ANCHORS.foot[0], ANCHORS.footY), at('chef_shoe', ANCHORS.foot[1], ANCHORS.footY)];
    this.arms = [
      at(`chef_arm_${skin}`, ANCHORS.shoulder[0], ANCHORS.shoulderY),
      at(`chef_arm_${skin}`, ANCHORS.shoulder[1], ANCHORS.shoulderY),
    ];
    this.torso = at(`chef_body_${slot % 8}`);
    this.torsoB = at(`chef_bodyb_${slot % 8}`).setVisible(false);
    if (held)
      this.itemImg = at(held.idle, ANCHORS.item.x, ANCHORS.item.y)
        .setVisible(false)
        .setScale(ITEM_SCALE / R);
    this.headF = at(`chef_head_${slot % 8}`);
    this.headB = at(`chef_headb_${slot % 8}`).setVisible(false);
    this.fa = at(`chef_fa_${slot % 8}`);
    this.eyes = [at('chef_eye_open', -ANCHORS.eyeX, ANCHORS.eyeY), at('chef_eye_open', ANCHORS.eyeX, ANCHORS.eyeY)];
    this.mouth = at('chef_mouth_smile', 0, ANCHORS.mouthY);
    this.fb = at(`chef_fb_${slot % 8}`);
    this.drop = at('chef_drop', ANCHORS.dropX, ANCHORS.dropY).setVisible(false);
    const hat = (this.hat = at(`chef_hat_${slot % 8}`));
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
    this.rig = scene.add.container(0, 0, [
      ...this.feet,
      this.torsoB,
      this.torso,
      ...this.arms,
      ...(this.itemImg ? [this.itemImg] : []),
      this.head,
    ]);
    this.tagKey = plateKey(scene, slot, name);
    this.tag = at(this.tagKey, 0, ANCHORS.tagY);
    this.spinStars = [0, 1, 2].map(() =>
      scene.add
        .image(0, 0, 'fx_star')
        .setScale((0.9 / R) * 1.4)
        .setVisible(false),
    );
    this.root = scene.add.container(0, 0, [this.shadow, this.ring, this.rig, ...this.spinStars, this.tag]);
    this.root.setScale(U * CHEF_SCALE);
  }

  /** Dress the rig with the player's Appearance for this game's role ('pizzas' | 'obstaculos' | 'arena'). Rebuilds only when the look changes. */
  setLook(ap: Appearance | undefined, role: string) {
    if (!ap) return;
    const id = `${JSON.stringify(ap)}|${role}`;
    if (id === this.lookId) return;
    this.lookId = id;
    const k = (this.look = lookTextures(this.scene, ap, role));
    this.torso.setTexture(k.torsoF);
    this.torsoB.setTexture(k.torsoB);
    this.headF.setTexture(k.headF);
    this.headB.setTexture(k.headB);
    this.fa.setVisible(false);
    this.fb.setTexture(k.over);
    this.hat.setTexture(k.hat);
    this.arms.forEach((a) => a.setTexture(k.arm));
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
  setPlayer(name: string, ap: Appearance | undefined, role: string) {
    this.setName(name);
    this.setLook(ap, role);
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
    this.tag.y = ANCHORS.tagY + (s.tagLift ?? 0);
    const speed = dt > 0 ? Math.hypot(dxp, dyp) / dt / TILE : 0;
    const moving = speed > 0.7 && s.action === 'none';
    const skating = moving && !!s.skate; // the feet do not walk on ice: they glide

    // facing
    const fc = facing(s.fx, s.fy, this.flip);
    this.face = fc.face;
    this.flip = fc.flip;

    // walk cycle
    if (moving && !skating) this.phase += dt * (HOUR / 0.5) * Math.min(1.15, Math.max(0.5, speed / 4.5));
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
    const { bounce, lean, footL, footR } = gait(this.phase, moving, skating, this.flip);

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

    // action loops (angles and lengths: rig-math; the hit beats and squashes stay here)
    const carrying = !!s.item;
    if (s.action === 'chop' || s.action === 'stretch') {
      this.hitT += dtMs;
      const period = s.action === 'chop' ? CHOP_MS : STRETCH_MS;
      const cyc = (this.hitT % period) / period;
      const prev = ((this.hitT - dtMs) % period) / period;
      if (prev < 0.5 && cyc >= 0.5) {
        this.onHit?.(s.action);
        this.sx = s.action === 'chop' ? 0.05 : 0.04;
        this.sy = -0.05;
        this.vx = 0;
        this.vy = 0;
      }
    } else this.hitT = 0;
    const arm = armPose({ action: s.action, hitT: this.hitT, carrying, face: this.face, moving, skating, phase: this.phase });
    const armA = arm.a,
      armB = arm.b,
      armsLen = [arm.lenA, arm.lenB];
    const [aL, aR] = this.arms as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    aL.setRotation(armA).setScale(1 / R, (armsLen[0] ?? 1) / R);
    aR.setRotation(armB).setScale(1 / R, (armsLen[1] ?? 1) / R);

    // feet
    this.feet[0]!.y = footL;
    this.feet[1]!.y = footR;

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
    for (const o of [this.fa, this.fb, this.mouth, ...this.eyes]) o.setVisible(!up && !(this.look && o === this.fa));
    this.hat.setVisible(!(up && this.look)); // from behind the baked head already carries the hat
    // carried item
    if (this.itemImg && this.held && s.item) {
      this.itemImg.setVisible(true).setTexture(this.held.keyOf(s.item));
      const at = itemAnchor(this.face);
      this.itemImg.setPosition(at.x, at.y);
    } else this.itemImg?.setVisible(false);

    // Ayudante: the propeller spins (the blades squash in x, as a disc seen from the front)
    this.prop.setVisible(!!s.assist);
    this.blades.setVisible(!!s.assist);
    if (s.assist) this.blades.setScale((0.3 + 0.7 * Math.abs(Math.cos(this.clock / 60))) / R, 1 / R);

    // head: bob and shake
    let headDx = 0;
    if (this.failT > 0) headDx = Math.sin(this.failT / 14) * 4 * Math.min(1, this.failT / 300);
    this.head.setPosition(headDx, moving ? -Math.abs(Math.sin(this.phase + 0.6)) * 1.2 : -br * 46);

    // face
    const { look, lookY } = eyeLook(this.face, s.fx, s.fy, this.flip);
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
