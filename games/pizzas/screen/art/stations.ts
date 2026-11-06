// Dynamic layer of the stations: items on boards and counters, progress bars, the oven (fire, pizza, ring), the bell.
import Phaser from 'phaser';
import type { Game, Item, Station } from '../../sim/overcooked';
import { C, TILE, U, progressColor, R } from '@pichi/screen-kit/art';
import { OX, OY } from './env/grid';
import { foodKey, ITEM_KIND, type FoodKind } from './food';
import { makeText, type Fx } from '@pichi/screen-kit/art/fx';
import { PANTRY_EVERY_MS, PANTRY_MAX } from '../../sim/versus/versus';
import { attachSaucepot, updateSaucepot } from './env/sauce-view';
import { windowArrow } from './env/window-arrow';
import { updateOven } from './env/oven-view';

export { Bar, place } from './station-parts';
import { Bar, place } from './station-parts';
import type { View } from './station-parts';

export class StationViews {
  private views: View[] = [];
  private t = 0;
  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private fx: Fx,
  ) {
    game.stations.forEach((st, idx) => this.views.push(this.build(st, idx)));
  }

  private build(st: Station, idx: number): View {
    const s = this.scene;
    const cx = OX + (st.tx + 0.5) * TILE,
      cy = OY + (st.ty + 0.5) * TILE;
    const d = 100 + OY + (st.ty + 1) * TILE; // depth: base line of the tile
    const v: View = { st, idx, cx, cy, itemKey: '', wasDone: false, emberT: 0, smokeT: Math.random() * 1000, flick: 0, chopping: false };
    if (st.kind === 'board') {
      v.bar = new Bar(s, 62);
      v.bar.root.setPosition(cx, cy - TILE * 0.36).setDepth(3000);
      v.knife = place(s, 'knife', cx + TILE * 0.2, cy + TILE * 0.24, 0.9)
        .setDepth(d - 2)
        .setRotation(-0.35);
    } else if (st.kind === 'crate' && st.pantry) {
      // the shared pantry: the stock both kitchens draw from (a count on each crate) and the clock of the next unit coming back
      v.badge = makeText(s, cx, cy - TILE * 0.34, '', { size: 34, color: C.cream, depth: 3000 });
      v.bar = new Bar(s, 62);
      v.bar.root.setPosition(cx, cy + TILE * 0.38).setDepth(3000);
    } else if (st.kind === 'saucepot') attachSaucepot(s, v, Bar, place);
    else if (st.kind === 'window') {
      v.bell = place(s, 'bell', cx, cy + TILE * 0.26, 0.9).setDepth(d - 2);
      v.arrow = windowArrow(s, this.game, st, cx, cy, place);
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
      v.glow = s.add
        .image(cx, cy + TILE * 0.25, 'fx_glow')
        .setScale(((U * 1.6) / R) * 2)
        .setDepth(d - 3)
        .setAlpha(0.2)
        .setBlendMode(Phaser.BlendModes.ADD);
      v.flames = [0, 1, 2].map((i) =>
        place(s, `flame_${i}`, cx + (i - 1) * TILE * 0.17, cy + TILE * (i === 1 ? 0.2 : 0.27), 0.7)
          .setDepth(d - 2.5)
          .setAlpha(0.65),
      );
      v.rawPizza = place(s, foodKey('pizza_raw'), cx, cy + TILE * 0.2, 0.78)
        .setDepth(d - 2)
        .setVisible(false);
      v.donePizza = place(s, foodKey('pizza_done'), cx, cy + TILE * 0.2, 0.78)
        .setDepth(d - 2)
        .setVisible(false);
      v.minis = [0, 1].map(() =>
        place(s, foodKey('dough_str'), cx, cy + TILE * 0.22, 0.56)
          .setDepth(d - 2)
          .setVisible(false),
      );
      v.ring = s.add.graphics().setDepth(3000);
      v.bar = new Bar(s, 62);
      v.bar.root.setPosition(cx, cy - TILE * 0.4).setDepth(3000); // the fold of the calzone
      v.foldArrow = place(s, foodKey('glyph_fold'), cx, cy - TILE * 0.3, 0.5)
        .setDepth(3000)
        .setVisible(false);
    }
    return v;
  }

  private stack(key: string, x: number, y: number, depth: number, max = 5): Phaser.GameObjects.Image[] {
    return Array.from({ length: max }, (_v, i) =>
      place(this.scene, key, x, y - i * 6, 0.6)
        .setDepth(depth - 2 + i * 0.01)
        .setVisible(false),
    );
  }

  stationAt(idx: number) {
    return this.views[idx];
  }
  pos(idx: number) {
    const v = this.views[idx];
    return v ? { x: v.cx, y: v.cy } : { x: 0, y: 0 };
  }

  ding(idx: number) {
    const v = this.views[idx];
    if (!v?.bell) return;
    this.scene.tweens.add({
      targets: v.bell,
      scaleY: v.bell.scaleY * 0.8,
      scaleX: v.bell.scaleX * 1.12,
      duration: 70,
      yoyo: true,
      ease: 'sine.out',
    });
    this.scene.tweens.add({ targets: v.bell, angle: { from: -10, to: 0 }, duration: 380, ease: 'elastic.out' });
  }
  windowIdx(team?: number) {
    return this.views.findIndex((v) => v.st.kind === 'window' && (team === undefined || v.st.owner === team));
  } // versus: each kitchen has its own window

  private setItem(v: View, item: Item | null) {
    const key = item ? foodKey(ITEM_KIND[item]) : '';
    if (key === v.itemKey) return;
    v.itemKey = key;
    v.itemImg?.destroy();
    v.itemImg = undefined;
    if (!item) return;
    const k: FoodKind = ITEM_KIND[item];
    const big = k === 'tray' || k === 'dish' || k === 'dish_q' || k === 'dish_p' || k === 'dish_m' || k === 'dish_c';
    const img = place(
      this.scene,
      key,
      v.cx,
      v.cy - TILE * (v.st.kind === 'board' ? 0.02 : 0.04),
      v.st.kind === 'board' ? 1.1 : big ? 0.95 : 1.05,
    ).setDepth(100 + v.cy + 4);
    v.itemImg = img;
    const sx = img.scaleX,
      sy = img.scaleY;
    img.setScale(sx * 0.5, sy * 0.5);
    this.scene.tweens.add({ targets: img, scaleX: sx, scaleY: sy, duration: 180, ease: 'back.out' });
  }

  update(dtMs: number, chopping: Map<number, 'chop' | 'stretch'>) {
    this.t += dtMs;
    for (const v of this.views) {
      const st = v.st;
      if (st.kind === 'board' || st.kind === 'counter') this.setItem(v, st.item);
      if (st.pantry) this.updatePantry(v);
      if (st.kind === 'board') {
        const act = chopping.get(v.idx);
        v.chopping = !!act;
        const bar = v.bar!;
        const showBar = !!st.item && st.item.startsWith('raw') && st.progress > 0;
        bar.root.setVisible(showBar);
        if (showBar) bar.set(st.progress, progressColor(st.progress));
        if (v.itemImg) v.itemImg.setAngle(act === 'chop' ? Math.sin(this.t / 40) * 4 : 0);
        v.knife!.setRotation(act === 'chop' ? -0.35 + Math.sin(this.t / 38) * 0.35 : -0.35).setY(
          v.cy + TILE * 0.24 + (act === 'chop' ? Math.max(0, Math.sin(this.t / 38)) * 4 : 0),
        );
      } else if (st.kind === 'pot') updateOven(this.scene, this.game, this.fx, this.t, v, dtMs, chopping.has(v.idx));
      else if (st.kind === 'window' && v.bell) v.bell.setY(v.cy + TILE * 0.26);
      else if (st.kind === 'dirty') this.updateCount(v, st.count, 3);
      else if (st.kind === 'plates' && v.badge) this.updateCount(v, st.count, 0, true);
      else if (st.kind === 'sink') this.updateSink(v, chopping.has(v.idx));
      else if (st.kind === 'saucepot') updateSaucepot(v, chopping.has(v.idx), this.t);
    }
  }

  // The shared pantry crate: the stock on its badge (red when empty) and a bar that fills towards the next unit.
  private updatePantry(v: View) {
    const p = this.game.pantry;
    if (!p) return;
    const b = v.badge!;
    b.setText(String(p.stock)).setColor(p.stock === 0 ? C.danger : C.cream);
    if (v.count !== undefined && p.stock > v.count)
      this.scene.tweens.add({ targets: b, scale: { from: 1.5, to: 1 }, duration: 220, ease: 'back.out' });
    v.count = p.stock;
    const full = p.stock >= PANTRY_MAX;
    v.bar!.root.setVisible(!full);
    if (!full) v.bar!.set(1 - Math.max(0, p.nextAt - this.game.time) / PANTRY_EVERY_MS, C.cheese);
  }

  // Count badge (and the plate pile for the return window). `warnAt`: from this many the badge turns red. `low`: red when empty.
  private updateCount(v: View, n: number, warnAt: number, low = false) {
    v.dirtyStack?.forEach((im, i) => im.setVisible(i < Math.min(n, v.dirtyStack!.length)));
    const b = v.badge!;
    b.setText(n > 0 || low ? String(n) : '');
    b.setColor(low ? (n === 0 ? C.danger : C.cream) : n >= warnAt && warnAt ? C.danger : C.cream);
    if (v.count !== undefined && n > v.count && !low)
      this.scene.tweens.add({ targets: b, scale: { from: 1.5, to: 1 }, duration: 220, ease: 'back.out' });
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

  destroy() {
    for (const v of this.views) {
      v.itemImg?.destroy();
      v.bar?.root.destroy();
      v.knife?.destroy();
      v.bell?.destroy();
      if (v.arrow) this.scene.tweens.killTweensOf(v.arrow); // the window's arrow bobs forever: stop its tween with it
      v.arrow?.destroy();
      v.ring?.destroy();
      v.glow?.destroy();
      v.rawPizza?.destroy();
      v.donePizza?.destroy();
      v.minis?.forEach((m) => m.destroy());
      v.dirtyStack?.forEach((m) => m.destroy());
      v.cleanStack?.forEach((m) => m.destroy());
      v.badge?.destroy();
      v.badge2?.destroy();
      v.flames?.forEach((f) => f.destroy());
    }
    this.views = [];
  }
}
