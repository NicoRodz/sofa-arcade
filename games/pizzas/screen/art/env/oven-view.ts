// The oven ('pot' station) of the dynamic station layer: fire, flames, glow, the pizza inside, the progress ring, the fold bar and the embers.
// Split from stations.ts, moved verbatim: it was StationViews.updateOven and read this.scene / this.game / this.fx / this.t, which now come in as arguments.
import type Phaser from 'phaser';
import type { Game } from '../../../sim/overcooked';
import { C, TILE, U, hexNum, progressColor, R } from '@pichi/screen-kit/art';
import { CUT_KIND, foodKey, type FoodKind } from '../food';
import type { Fx } from '@pichi/screen-kit/art/fx';
import { canFold, isBaking } from '../../../sim/recipes/sim';
import { ovenKinds } from '../food/recipes';
import type { View } from '../station-parts';

export function updateOven(scene: Phaser.Scene, game: Game, fx: Fx, t: number, v: View, dtMs: number, folding = false) {
  const st = v.st;
  const burn = game.burn;
  if (st.fire !== undefined) {
    // on fire (burn.ts): the flames are drawn by BurnView; the oven itself shows nothing of its contents
    for (const o of [v.rawPizza!, v.donePizza!, ...v.minis!, ...v.flames!, v.foldArrow!]) o.setVisible(false);
    v.bar!.root.setVisible(false);
    v.glow!.setAlpha(0.1);
    v.ring!.clear();
    v.wasDone = false;
    return;
  }
  v.flames!.forEach((f) => f.setVisible(true));
  const burnt = !!st.burnt;
  const cooking = isBaking(st) && !st.done; // dough + tomato or sauce (or a stage of the white pizza); cheese may join until it is done
  const kinds = ovenKinds(st.inputs, !!st.folded); // what is in it: Marinara, Margarita, Pepperoni, Champiñón or the folded Calzone
  const dark = !!game.mid?.dark; // the "Corte de luz" event: the oven is off, nothing glows and nothing crackles
  const lit = (cooking || (st.done && !burnt)) && !dark;
  v.flick -= dtMs;
  if (v.flick <= 0) {
    v.flick = 90;
    const base = (0.7 * U) / R;
    v.flames!.forEach((f) =>
      f
        .setScale(base * (cooking ? 1.1 : 0.85), base * (0.9 + Math.random() * 0.2) * (cooking ? 1.3 : lit ? 1 : 0.75))
        .setAlpha(dark ? 0.12 : lit ? 0.95 : 0.8),
    );
  }
  v.glow!.setAlpha(dark ? 0.03 : lit ? 0.55 + Math.sin(t / 90) * 0.08 : 0.2);
  // contents
  const partial = cooking || st.done ? [] : st.inputs; // loose ingredients waiting for the rest
  v.minis!.forEach((m, i) => {
    const t = partial[i];
    m.setVisible(t !== undefined);
    if (t === undefined) return;
    m.setTexture(foodKey(CUT_KIND[t]!)).setX(v.cx + (partial.length === 1 ? 0 : (i ? 1 : -1) * TILE * 0.17));
  });
  const rawKey = foodKey(kinds.raw as FoodKind),
    doneKey = foodKey((burnt ? 'pizza_burnt' : kinds.done) as FoodKind);
  if (v.rawPizza!.texture.key !== rawKey) v.rawPizza!.setTexture(rawKey);
  if (v.donePizza!.texture.key !== doneKey) v.donePizza!.setTexture(doneKey);
  v.rawPizza!.setVisible(cooking || false).setAngle(folding ? Math.sin(t / 45) * 7 : 0); // folding: the dough is worked, it wobbles
  // the calzone: a bar fills while Picar folds; an arrow invites the fold on an oven that can be folded (a card with a calzone, dough and tomato baking)
  v.bar!.root.setVisible(st.fold !== undefined && !st.folded);
  if (st.fold !== undefined) v.bar!.set(st.fold, C.cheese);
  v.foldArrow!.setVisible(canFold(game, st) && !dark && !folding)
    .setAlpha(0.6 + Math.sin(t / 170) * 0.25)
    .setY(v.cy - TILE * 0.3 + Math.sin(t / 170) * 3);
  v.donePizza!.setVisible(st.done || cooking);
  if (cooking) {
    v.rawPizza!.setAlpha(1);
    v.donePizza!.setAlpha(Math.max(0, (st.progress - 0.15) / 0.85));
  } else if (st.done) v.donePizza!.setAlpha(1);
  // ring around the icon: amber arc while cooking, solid green when ready. With the burn rules on, the green ring is the grace time left: it empties
  // (green, then amber, then red and blinking after the warning) and a burnt pizza has a solid dark-red ring
  const g = v.ring!;
  g.clear();
  if (cooking || st.done) {
    const r = TILE * 0.22,
      y = v.cy + TILE * 0.2 + 2;
    g.lineStyle(7, 0x2b1b17, 0.9).strokeCircle(v.cx, y - 2, r + 2);
    if (st.done && burn && burnt) g.lineStyle(6, hexNum(C.danger), 1).strokeCircle(v.cx, y - 2, r + 2);
    else if (st.done && burn && st.readyAt !== undefined) {
      const left = Math.max(0, Math.min(1, 1 - (game.time - st.readyAt) / burn.graceMs));
      const blink = !!st.warned && Math.floor(t / 120) % 2 === 0;
      g.lineStyle(6, hexNum(blink ? C.danger : left > 0.5 ? C.basil : left > 0.3 ? C.warn : C.danger), 1);
      g.beginPath();
      g.arc(v.cx, y - 2, r + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, left), false);
      g.strokePath();
      if (st.warned) v.donePizza!.setX(v.cx + Math.sin(t / 35) * 2.2); // the pizza trembles: take it out now
    } else if (st.done) g.lineStyle(6, hexNum(C.basil), 1).strokeCircle(v.cx, y - 2, r + 2);
    else {
      g.lineStyle(6, hexNum(progressColor(st.progress)), 1);
      g.beginPath();
      g.arc(v.cx, y - 2, r + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.progress, false);
      g.strokePath();
    }
  }
  if (!st.warned || burnt) v.donePizza!.setX(v.cx);
  if (st.done && !v.wasDone) {
    fx.ring(v.cx, v.cy + TILE * 0.2, hexNum(C.basil), 0.4, 1.4);
    const d = v.donePizza!,
      k = d.scaleX;
    scene.tweens.add({ targets: d, scaleX: k * 1.3, scaleY: k * 1.3, duration: 120, yoyo: true, ease: 'sine.out' });
  }
  v.wasDone = st.done;
  if (burnt) {
    v.smokeT -= dtMs; // a burnt pizza smokes black until somebody takes it out
    if (v.smokeT <= 0) {
      v.smokeT = 150;
      fx.sootPuff(v.cx + (Math.random() - 0.5) * TILE * 0.3, v.cy + TILE * 0.05);
    }
  }
  // embers and chimney smoke while cooking
  if (cooking && !dark) {
    v.emberT -= dtMs;
    if (v.emberT <= 0) {
      v.emberT = 200;
      fx.ember(v.cx + (Math.random() - 0.5) * TILE * 0.3, v.cy + TILE * 0.2);
    }
    v.smokeT -= dtMs;
    if (v.smokeT <= 0) {
      v.smokeT = 520;
      fx.smokePuff(v.cx + TILE * 0.3, v.cy - TILE * 0.55);
    }
  }
}
