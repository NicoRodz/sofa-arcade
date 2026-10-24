// Dynamic layer of the stations: items on boards and counters, progress bars, the oven (fire, pizza, ring), the bell.
import Phaser from 'phaser';
import type { Game, Item, Station } from '@party/shared/game';
import { C, OX, OY, TILE, U, hexNum, progressColor } from './tokens';
import { R, texSize } from './gfx';
import { CUT_KIND, foodKey, ITEM_KIND, type FoodKind } from './food';
import { makeText, type Fx } from './fx';

export function place(scene: Phaser.Scene, key: string, x: number, y: number, k = 1): Phaser.GameObjects.Image {
  const t = texSize(key)!;
  return scene.add.image(x, y, key).setOrigin(t.ox / t.w, t.oy / t.h).setScale((U / t.r) * k);
}

export class Bar {
  readonly root: Phaser.GameObjects.Container;
  private fill: Phaser.GameObjects.Image;
  private bg: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, w = 60) {
    this.bg = scene.add.image(0, 0, 'bar_bg').setScale((w + 6) / 66 / R);
    this.fill = scene.add.image(-w / 2, 0, 'bar_fill').setOrigin(0, 0.5).setScale(w / 60 / R);
    this.root = scene.add.container(0, 0, [this.bg, this.fill]).setVisible(false);
  }
  set(v: number, color: string) {
    const c = Math.max(0, Math.min(1, v));
    this.fill.setCrop(0, 0, 60 * R * c, 12 * R).setTint(hexNum(color));
    this.fill.setVisible(c > 0.001);
  }
}

interface View {
  st: Station;
  idx: number;
  cx: number; cy: number; // tile centre, logical px
  itemImg?: Phaser.GameObjects.Image;
  itemKey: string;
  bar?: Bar;
  knife?: Phaser.GameObjects.Image;
  flames?: Phaser.GameObjects.Image[];
  glow?: Phaser.GameObjects.Image;
  rawPizza?: Phaser.GameObjects.Image;
  donePizza?: Phaser.GameObjects.Image;
  minis?: Phaser.GameObjects.Image[];
  ring?: Phaser.GameObjects.Graphics;
  bell?: Phaser.GameObjects.Image;
  dirtyStack?: Phaser.GameObjects.Image[]; // dirty plates waiting (return window) or to wash (sink)
  cleanStack?: Phaser.GameObjects.Image[]; // clean plates on the sink
  badge?: Phaser.GameObjects.Text; // main count
  badge2?: Phaser.GameObjects.Text; // sink: clean count
  count?: number; count2?: number;
  arrow?: Phaser.GameObjects.Image;
  wasDone: boolean;
  emberT: number; smokeT: number; flick: number;
  chopping: boolean;
}

export class StationViews {
  private views: View[] = [];
  private t = 0;

  constructor(private scene: Phaser.Scene, private game: Game, private fx: Fx) {
    game.stations.forEach((st, idx) => this.views.push(this.build(st, idx)));
  }

  private build(st: Station, idx: number): View {
    const s = this.scene;
    const cx = OX + (st.tx + 0.5) * TILE, cy = OY + (st.ty + 0.5) * TILE;
    const d = 100 + OY + (st.ty + 1) * TILE; // depth: base line of the tile
    const v: View = { st, idx, cx, cy, itemKey: '', wasDone: false, emberT: 0, smokeT: Math.random() * 1000, flick: 0, chopping: false };
    if (st.kind === 'board') {
      v.bar = new Bar(s, 62);
      v.bar.root.setPosition(cx, cy - TILE * 0.36).setDepth(3000);
      v.knife = place(s, 'knife', cx + TILE * 0.2, cy + TILE * 0.24, 0.9).setDepth(d - 2).setRotation(-0.35);
    } else if (st.kind === 'counter') {
      /* items only */
    } else if (st.kind === 'window') {
      v.bell = place(s, 'bell', cx, cy + TILE * 0.26, 0.9).setDepth(d - 2);
      const dir = this.openSide(st);
      v.arrow = place(s, 'arrow', cx + dir[0] * TILE, cy + dir[1] * TILE, 0.8).setRotation(Math.atan2(-dir[1], -dir[0])).setAlpha(0.85).setDepth(2);
      s.tweens.add({ targets: v.arrow, x: v.arrow.x - dir[0] * TILE * 0.22, y: v.arrow.y - dir[1] * TILE * 0.22, duration: 520, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    } else if (st.kind === 'dirty') {
      v.dirtyStack = this.stack(foodKey('tray_dirty'), cx, cy + TILE * 0.12, d);
      v.badge = makeText(s, cx + TILE * 0.3, cy - TILE * 0.3, '', { size: 30, color: C.cream, depth: 3000 });
    } else if (st.kind === 'sink') {
      v.bar = new Bar(s, 62);
      v.bar.root.setPosition(cx, cy - TILE * 0.38).setDepth(3000);
      v.dirtyStack = this.stack(foodKey('tray_dirty'), cx - TILE * 0.2, cy + TILE * 0.2, d, 3);
      v.cleanStack = this.stack(foodKey('tray'), cx + TILE * 0.22, cy + TILE * 0.2, d, 3);
      v.badge = makeText(s, cx - TILE * 0.3, cy - TILE * 0.18, '', { size: 26, color: C.cream, depth: 3000 });
      v.badge2 = makeText(s, cx + TILE * 0.3, cy - TILE * 0.18, '', { size: 26, color: C.basil, depth: 3000 });
    } else if (st.kind === 'plates' && this.game.finitePlates) {
      v.badge = makeText(s, cx + TILE * 0.32, cy - TILE * 0.3, '', { size: 30, color: C.cream, depth: 3000 });
    } else if (st.kind === 'pot') {
      v.glow = s.add.image(cx, cy + TILE * 0.25, 'fx_glow').setScale((U * 1.6) / R * 2).setDepth(d - 3).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD);
      v.flames = [0, 1, 2].map((i) => place(s, `flame_${i}`, cx + (i - 1) * TILE * 0.17, cy + TILE * (i === 1 ? 0.2 : 0.27), 0.7).setDepth(d - 2.5).setAlpha(0.65));
      v.rawPizza = place(s, foodKey('pizza_raw'), cx, cy + TILE * 0.2, 0.78).setDepth(d - 2).setVisible(false);
      v.donePizza = place(s, foodKey('pizza_done'), cx, cy + TILE * 0.2, 0.78).setDepth(d - 2).setVisible(false);
      v.minis = [0, 1].map(() => place(s, foodKey('dough_str'), cx, cy + TILE * 0.22, 0.56).setDepth(d - 2).setVisible(false));
      v.ring = s.add.graphics().setDepth(3000);
    }
    return v;
  }

  // up to `max` plate images piled up, bottom first
  private stack(key: string, x: number, y: number, depth: number, max = 5): Phaser.GameObjects.Image[] {
    return Array.from({ length: max }, (_v, i) => place(this.scene, key, x, y - i * 6, 0.6).setDepth(depth - 2 + i * 0.01).setVisible(false));
  }

  private openSide(st: Station): [number, number] {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) if (this.game.grid[st.ty + dy]?.[st.tx + dx]?.kind === 'floor') return [dx, dy];
    return [0, 1];
  }

  stationAt(idx: number) { return this.views[idx]; }
  pos(idx: number) { const v = this.views[idx]; return v ? { x: v.cx, y: v.cy } : { x: 0, y: 0 }; }

  ding(idx: number) {
    const v = this.views[idx];
    if (!v?.bell) return;
    this.scene.tweens.add({ targets: v.bell, scaleY: v.bell.scaleY * 0.8, scaleX: v.bell.scaleX * 1.12, duration: 70, yoyo: true, ease: 'sine.out' });
    this.scene.tweens.add({ targets: v.bell, angle: { from: -10, to: 0 }, duration: 380, ease: 'elastic.out' });
  }
  windowIdx(team?: number) { return this.views.findIndex((v) => v.st.kind === 'window' && (team === undefined || v.st.owner === team)); } // versus: each kitchen has its own window

  private setItem(v: View, item: Item | null) {
    const key = item ? foodKey(ITEM_KIND[item]) : '';
    if (key === v.itemKey) return;
    v.itemKey = key;
    v.itemImg?.destroy();
    v.itemImg = undefined;
    if (!item) return;
    const k: FoodKind = ITEM_KIND[item];
    const big = k === 'tray' || k === 'dish' || k === 'dish_q';
    const img = place(this.scene, key, v.cx, v.cy - TILE * (v.st.kind === 'board' ? 0.02 : 0.04), v.st.kind === 'board' ? 1.1 : big ? 0.95 : 1.05).setDepth(100 + v.cy + 4);
    v.itemImg = img;
    const sx = img.scaleX, sy = img.scaleY;
    img.setScale(sx * 0.5, sy * 0.5);
    this.scene.tweens.add({ targets: img, scaleX: sx, scaleY: sy, duration: 180, ease: 'back.out' });
  }

  update(dtMs: number, chopping: Map<number, 'chop' | 'stretch'>) {
    this.t += dtMs;
    for (const v of this.views) {
      const st = v.st;
      if (st.kind === 'board' || st.kind === 'counter') this.setItem(v, st.item);
      if (st.kind === 'board') {
        const act = chopping.get(v.idx);
        v.chopping = !!act;
        const bar = v.bar!;
        const showBar = !!st.item && st.item.startsWith('raw') && st.progress > 0;
        bar.root.setVisible(showBar);
        if (showBar) bar.set(st.progress, progressColor(st.progress));
        if (v.itemImg) v.itemImg.setAngle(act === 'chop' ? Math.sin(this.t / 40) * 4 : 0);
        v.knife!.setRotation(act === 'chop' ? -0.35 + Math.sin(this.t / 38) * 0.35 : -0.35).setY(v.cy + TILE * 0.24 + (act === 'chop' ? Math.max(0, Math.sin(this.t / 38)) * 4 : 0));
      } else if (st.kind === 'pot') this.updateOven(v, dtMs);
      else if (st.kind === 'window' && v.bell) v.bell.setY(v.cy + TILE * 0.26);
      else if (st.kind === 'dirty') this.updateCount(v, st.count, 3);
      else if (st.kind === 'plates' && v.badge) this.updateCount(v, st.count, 0, true);
      else if (st.kind === 'sink') this.updateSink(v, chopping.has(v.idx));
    }
  }

  // Count badge (and the plate pile for the return window). `warnAt`: from this many the badge turns red. `low`: red when empty.
  private updateCount(v: View, n: number, warnAt: number, low = false) {
    v.dirtyStack?.forEach((im, i) => im.setVisible(i < Math.min(n, v.dirtyStack!.length)));
    const b = v.badge!;
    b.setText(n > 0 || low ? String(n) : '');
    b.setColor(low ? (n === 0 ? C.danger : C.cream) : n >= warnAt && warnAt ? C.danger : C.cream);
    if (v.count !== undefined && n > v.count && !low) this.scene.tweens.add({ targets: b, scale: { from: 1.5, to: 1 }, duration: 220, ease: 'back.out' });
    v.count = n;
  }

  private updateSink(v: View, washing: boolean) {
    const st = v.st;
    v.dirtyStack!.forEach((im, i) => im.setVisible(i < Math.min(st.count, 3)));
    v.cleanStack!.forEach((im, i) => im.setVisible(i < Math.min(st.clean, 3)));
    v.badge!.setText(st.count > 0 ? String(st.count) : '');
    v.badge2!.setText(st.clean > 0 ? String(st.clean) : '');
    const bar = v.bar!;
    bar.root.setVisible(st.count > 0 && st.progress > 0);
    if (st.count > 0 && st.progress > 0) bar.set(st.progress, C.basil);
    v.dirtyStack!.forEach((im, i) => im.setAngle(washing ? Math.sin(this.t / 45 + i) * 3 : 0));
  }

  private updateOven(v: View, dtMs: number) {
    const st = v.st;
    const cooking = st.inputs.includes(0) && st.inputs.includes(1) && !st.done; // dough + tomato; cheese may join until it is done
    const q = st.inputs.includes(2); // Margarita
    const lit = cooking || st.done;
    v.flick -= dtMs;
    if (v.flick <= 0) {
      v.flick = 90;
      const base = (0.7 * U) / R;
      v.flames!.forEach((f) => f.setScale(base * (cooking ? 1.1 : 0.85), base * (0.9 + Math.random() * 0.2) * (cooking ? 1.3 : lit ? 1 : 0.75)).setAlpha(lit ? 0.95 : 0.8));
    }
    v.glow!.setAlpha(lit ? 0.55 + Math.sin(this.t / 90) * 0.08 : 0.2);
    // contents
    const partial = cooking || st.done ? [] : st.inputs; // loose ingredients waiting for the rest
    v.minis!.forEach((m, i) => {
      const t = partial[i];
      m.setVisible(t !== undefined);
      if (t === undefined) return;
      m.setTexture(foodKey(CUT_KIND[t]!)).setX(v.cx + (partial.length === 1 ? 0 : (i ? 1 : -1) * TILE * 0.17));
    });
    const rawKey = foodKey(q ? 'pizza_raw_q' : 'pizza_raw'), doneKey = foodKey(q ? 'pizza_done_q' : 'pizza_done');
    if (v.rawPizza!.texture.key !== rawKey) v.rawPizza!.setTexture(rawKey);
    if (v.donePizza!.texture.key !== doneKey) v.donePizza!.setTexture(doneKey);
    v.rawPizza!.setVisible(cooking || false);
    v.donePizza!.setVisible(st.done || cooking);
    if (cooking) { v.rawPizza!.setAlpha(1); v.donePizza!.setAlpha(Math.max(0, (st.progress - 0.15) / 0.85)); }
    else if (st.done) v.donePizza!.setAlpha(1);
    // ring around the icon: amber arc while cooking, solid green when ready
    const g = v.ring!; g.clear();
    if (cooking || st.done) {
      const r = TILE * 0.22, y = v.cy + TILE * 0.2 + 2;
      g.lineStyle(7, 0x2b1b17, 0.9).strokeCircle(v.cx, y - 2, r + 2);
      if (st.done) g.lineStyle(6, hexNum(C.basil), 1).strokeCircle(v.cx, y - 2, r + 2);
      else { g.lineStyle(6, hexNum(progressColor(st.progress)), 1); g.beginPath(); g.arc(v.cx, y - 2, r + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.progress, false); g.strokePath(); }
    }
    if (st.done && !v.wasDone) {
      this.fx.ring(v.cx, v.cy + TILE * 0.2, hexNum(C.basil), 0.4, 1.4);
      const d = v.donePizza!, k = d.scaleX;
      this.scene.tweens.add({ targets: d, scaleX: k * 1.3, scaleY: k * 1.3, duration: 120, yoyo: true, ease: 'sine.out' });
    }
    v.wasDone = st.done;
    // embers and chimney smoke while cooking
    if (cooking) {
      v.emberT -= dtMs; if (v.emberT <= 0) { v.emberT = 200; this.fx.ember(v.cx + (Math.random() - 0.5) * TILE * 0.3, v.cy + TILE * 0.2); }
      v.smokeT -= dtMs; if (v.smokeT <= 0) { v.smokeT = 520; this.fx.smokePuff(v.cx + TILE * 0.3, v.cy - TILE * 0.55); }
    }
  }

  destroy() {
    for (const v of this.views) { v.itemImg?.destroy(); v.bar?.root.destroy(); v.knife?.destroy(); v.bell?.destroy(); v.arrow?.destroy(); v.ring?.destroy(); v.glow?.destroy(); v.rawPizza?.destroy(); v.donePizza?.destroy(); v.minis?.forEach((m) => m.destroy()); v.dirtyStack?.forEach((m) => m.destroy()); v.cleanStack?.forEach((m) => m.destroy()); v.badge?.destroy(); v.badge2?.destroy(); v.flames?.forEach((f) => f.destroy()); }
    this.views = [];
  }
}
