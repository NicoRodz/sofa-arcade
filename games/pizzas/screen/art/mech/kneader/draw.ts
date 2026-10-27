// Art of 'kneader' (M), implemented by T1e, drawn by code with Phaser Graphics over the kitchen: a wooden trough set in the wall with the dough ball and a rolling pin, the two handles (levers on the floor
// tiles either side of it) and the progress bar the two chefs share. An empty handle pulses amber while a ball waits; a held one is green. `draw(scene, game, t)`: the screen calls it every frame.
import type Phaser from 'phaser';
import type { Game } from '../../../../sim/overcooked';
import type { MechArt } from '../../../../sim/mech/types';
import { handlesOf, GOAL, kneading } from '../../../../sim/mech/kneader/state';
import { C, OX, OY, TILE, hexNum } from '@pichi/screen-kit/art/tokens';

const layers = new WeakMap<Phaser.Scene, Phaser.GameObjects.Graphics>();
function layer(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  let l = layers.get(scene);
  if (!l) {
    l = scene.add.graphics().setDepth(2500);
    layers.set(scene, l);
  }
  return l;
}

export function drawKneaders(gfx: Phaser.GameObjects.Graphics, g: Game, t: number) {
  for (const [key, st] of Object.entries(g.mech?.kneader ?? {})) {
    const i = Number(key);
    const s = g.stations[i]!;
    const x = OX + s.tx * TILE,
      y = OY + s.ty * TILE;
    const busy = kneading(s);
    const frac = st.prog / GOAL;
    const handles = handlesOf(g, i);
    // trough: wood body, darker rim, flour
    gfx.fillStyle(hexNum(C.wood2), 1).fillRoundedRect(x + TILE * 0.06, y + TILE * 0.1, TILE * 0.88, TILE * 0.8, TILE * 0.12);
    gfx.fillStyle(hexNum(C.wood), 1).fillRoundedRect(x + TILE * 0.14, y + TILE * 0.18, TILE * 0.72, TILE * 0.64, TILE * 0.1);
    gfx.fillStyle(hexNum(C.dough2), 1).fillRoundedRect(x + TILE * 0.2, y + TILE * 0.24, TILE * 0.6, TILE * 0.52, TILE * 0.08);
    // the dough: a ball that grows while it is worked, flat and smooth when it is done
    const cx = x + TILE / 2,
      cy = y + TILE / 2;
    if (s.item === 'cut0')
      gfx
        .fillStyle(hexNum(C.dough), 1)
        .fillEllipse(cx, cy, TILE * 0.54, TILE * 0.36)
        .lineStyle(3, hexNum(C.doughEdge), 1)
        .strokeEllipse(cx, cy, TILE * 0.54, TILE * 0.36);
    else if (busy) {
      const wob = Math.sin(t / 90) * TILE * 0.02 * (frac > 0 ? 1 : 0);
      gfx.fillStyle(hexNum(C.dough), 1).fillCircle(cx, cy + wob, TILE * (0.14 + 0.1 * frac));
      // the rolling pin sweeps across the ball while somebody works it
      if (frac > 0 && st.hands.some((id) => id > 0)) {
        const px = cx + Math.sin(t / 140) * TILE * 0.22;
        gfx.fillStyle(hexNum(C.steel2), 1).fillRoundedRect(px - TILE * 0.05, cy - TILE * 0.3, TILE * 0.1, TILE * 0.6, TILE * 0.04);
      }
    }
    // the handles: a lever from M's edge to the middle of the floor tile, a knob at the end
    handles.forEach(([hx, hy], h) => {
      const hxp = OX + (hx + 0.5) * TILE,
        hyp = OY + (hy + 0.5) * TILE;
      const held = st.hands[h]! > 0;
      const wait = busy && !held;
      const pulse = wait ? 0.5 + 0.5 * Math.sin(t / 160) : 0;
      gfx.lineStyle(TILE * 0.09, hexNum(C.wood2), 1).lineBetween(cx, cy, hxp, hyp);
      gfx.fillStyle(hexNum(held ? C.basil : wait ? C.warn : C.steel2), 1).fillCircle(hxp, hyp, TILE * (0.13 + 0.05 * pulse));
      if (wait) gfx.lineStyle(4, hexNum(C.warn), 0.4 + 0.5 * pulse).strokeCircle(hxp, hyp, TILE * (0.24 + 0.08 * pulse));
    });
    // the bar both chefs share, above M
    if (busy || s.item === 'cut0') {
      const w = TILE * 1.6,
        bx = cx - w / 2,
        by = y - TILE * 0.12;
      gfx.fillStyle(hexNum(C.ink), 0.85).fillRoundedRect(bx - 4, by - 4, w + 8, TILE * 0.17 + 8, 6);
      gfx.fillStyle(hexNum(frac >= 1 ? C.basil : C.cheese), 1).fillRoundedRect(bx, by, Math.max(2, w * Math.min(1, frac)), TILE * 0.17, 4);
    }
  }
}

export const kneaderArt: MechArt = {
  draw: (scene?: Phaser.Scene, g?: Game, t = 0) => {
    if (!scene || !g) return;
    const gfx = layer(scene);
    gfx.clear();
    drawKneaders(gfx, g, t);
  },
};
