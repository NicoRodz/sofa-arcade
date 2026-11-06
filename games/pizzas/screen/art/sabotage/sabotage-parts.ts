// Versus sabotage on screen: the pieces of SabotageView that need no state of their own (split from sabotage.ts, moved verbatim; the scene,
// the game and the maps of views come in as arguments): tile and arc maths, the rubbish and dropped items on the floor, the catapult cooldown ring.
import type Phaser from 'phaser';
import type { Game } from '../../../sim/overcooked';
import type { TeamInfo } from '@pichi/core/lobby';
import { WINDUP_MS } from '../../../sim/sabotage-config';
import type { CatapultState } from '../../../sim/rules/sabotage';
import { C, TILE, hexNum } from '@pichi/screen-kit/art';
import { OX, OY } from '../env/grid';
import { foodKey, ITEM_KIND } from '../food';
import { place } from '../stations';

export const tilePx = (tx: number, ty: number) => ({ x: OX + (tx + 0.5) * TILE, y: OY + (ty + 0.5) * TILE });
export const arc = (from: { x: number; y: number }, to: { x: number; y: number }, t: number, lift: number) => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t - lift * 4 * t * (1 - t),
});
export const light = (hex: string) => {
  const n = hexNum(hex),
    m = (v: number) => Math.min(255, Math.round(v + (255 - v) * 0.45));
  return (m((n >> 16) & 255) << 16) | (m((n >> 8) & 255) << 8) | m(n & 255);
};

export interface FloorView {
  id: number;
  img: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Graphics;
  born: number;
  spawn: number;
}
export interface PostView {
  ring: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  bag: Phaser.GameObjects.Image;
  cdFrom: number;
  cdTo: number;
  flash: number;
}

export function updateFloorViews(
  scene: Phaser.Scene,
  g: Game,
  view: { teams: readonly TeamInfo[] | null } | undefined,
  floorViews: Map<number, FloorView>,
  t: number,
) {
  // rubbish and items on the floor
  const seen = new Set<number>();
  for (const f of g.floor) {
    seen.add(f.id);
    let v = floorViews.get(f.id);
    const p = tilePx(f.tx, f.ty);
    if (!v) {
      const img = place(scene, foodKey(ITEM_KIND[f.item]), p.x, p.y + TILE * 0.05, f.kind === 'trash' ? 1.35 : 0.9).setDepth(
        100 + p.y - 30,
      );
      v = { id: f.id, img, ring: scene.add.graphics().setDepth(100 + p.y - 31), born: t, spawn: t };
      img.setScale(img.scaleX * 1.9);
      scene.tweens.add({ targets: img, scale: img.scaleX / 1.9, duration: 240, ease: 'back.out' });
      floorViews.set(f.id, v);
    }
    const g2 = v.ring;
    g2.clear();
    const info = f.by !== null ? view?.teams?.[f.by] : undefined;
    const pulse = 0.65 + 0.35 * Math.sin(t / 160);
    if (f.kind === 'trash') {
      const col = info ? hexNum(info.color) : 0xffffff;
      g2.lineStyle(7, 0x2b1b17, 0.8).strokeCircle(p.x, p.y + TILE * 0.05, TILE * 0.42);
      g2.lineStyle(5, col, pulse).strokeCircle(p.x, p.y + TILE * 0.05, TILE * 0.42); // the colour of the team that threw it
      if (Number.isFinite(f.expiresAt)) {
        // life ring: it empties; in the last quarter it blinks
        const left = Math.max(0, (f.expiresAt - g.time) / (f.expiresAt - f.bornAt));
        const blink = left < 0.25 && Math.floor(t / 130) % 2 === 0;
        g2.lineStyle(4, blink ? hexNum(C.danger) : 0xffffff, 0.9);
        g2.beginPath();
        g2.arc(p.x, p.y + TILE * 0.05, TILE * 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
        g2.strokePath();
        v.img.setAlpha(blink ? 0.55 : 1);
      }
    } else {
      g2.lineStyle(4, hexNum(C.cream), 0.55 + 0.3 * Math.sin(t / 200)).strokeCircle(p.x, p.y + TILE * 0.05, TILE * 0.38); // a dropped item: pick it up
      v.img.setPosition(
        p.x + (g.floor.some((o) => o !== f && o.kind === 'trash' && o.tx === f.tx && o.ty === f.ty) ? TILE * 0.14 : 0),
        p.y + TILE * 0.05 - Math.abs(Math.sin(t / 260)) * 4,
      ); // beside the banana-skin it fell on
    }
  }
  for (const [id, v] of [...floorViews])
    if (!seen.has(id)) {
      v.img.destroy();
      v.ring.destroy();
      floorViews.delete(id);
    }
}

export function cooldownRing(game: Game, posts: PostView[], i: number, state: CatapultState) {
  const g = game,
    sab = g.sab!,
    post = posts[i]!,
    st = sab.teams[i]!;
  const [tx, ty] = sab.catapults[i]!;
  const p = tilePx(tx, ty),
    r = TILE * 0.4,
    cy = p.y + TILE * 0.08;
  const ring = post.ring;
  ring.clear();
  const cooling = g.time < st.cooldownUntil;
  const left = Math.max(0, st.cooldownUntil - g.time);
  const frac = cooling ? 1 - left / Math.max(1, post.cdTo - post.cdFrom || sab.rules.cooldownMs) : 1;
  const flash = post.flash > 0 && Math.floor(post.flash / 90) % 2 === 0;
  const bad = state === 'piles' || state === 'window' || flash;
  const col = bad ? hexNum(C.danger) : cooling ? hexNum(C.warn) : hexNum(C.basil);
  ring.lineStyle(9, 0x2b1b17, 0.85).strokeCircle(p.x, cy, r);
  ring.lineStyle(6, col, 1);
  if (frac >= 0.999 || bad) ring.strokeCircle(p.x, cy, r);
  else {
    ring.beginPath();
    ring.arc(p.x, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
    ring.strokePath();
  }
  const [ox, oy] = openSide(game, tx, ty); // the label goes on the side the chef does not stand on
  post.label.setPosition(p.x - ox * TILE * 0.8, p.y - oy * TILE * 0.8);
  post.label.setText(
    cooling && !bad
      ? String(Math.ceil(left / 1000))
      : bad && state === 'piles'
        ? 'lleno'
        : bad && state === 'window'
          ? 'pausa'
          : st.aim
            ? '¡apunta!'
            : '',
  );
  post.label.setColor(bad ? C.danger : C.cream);
  // the bag in the cup while somebody aims
  post.bag.setVisible(!!st.aim || st.flights.some((f) => g.time < f.launchAt + WINDUP_MS));
}

function openSide(game: Game, tx: number, ty: number): [number, number] {
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const)
    if (game.grid[ty + dy]?.[tx + dx]?.kind === 'floor') return [dx, dy];
  return [0, -1];
}
