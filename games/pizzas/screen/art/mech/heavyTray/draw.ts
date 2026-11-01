// Art of 'heavyTray' (design section 3, "Arte y teléfono"), implemented by T2, drawn by code with Phaser Graphics: the carrier's plate rides on a wooden tray with a handle at each end; when a helper takes the other end, the helper's
// handle is drawn as a bar from the helper to the tray (green), and an uncoupled tray that waits for help pulses amber. `draw(scene, game, t)`: the screen calls it every frame.
import type Phaser from 'phaser';
import type { Game } from '../../../../sim/overcooked';
import type { MechArt } from '../../../../sim/mech/types';
import { carriesTray } from '../../../../sim/mech/heavyTray/state';
import { C, TILE, hexNum } from '@pichi/screen-kit/art';
import { OX, OY } from '../../env/grid';

const layers = new WeakMap<Phaser.Scene, Phaser.GameObjects.Graphics>();
function layer(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  let l = layers.get(scene);
  if (!l) {
    l = scene.add.graphics().setDepth(2600);
    layers.set(scene, l);
  }
  return l;
}

export function drawTrays(gfx: Phaser.GameObjects.Graphics, g: Game, t: number) {
  const tray = g.mech?.tray;
  if (!tray) return;
  const px = (v: number) => OX + v * TILE,
    py = (v: number) => OY + v * TILE;
  for (const p of g.players.values()) {
    if (!carriesTray(g, p)) continue;
    const helper = tray.helper !== null && tray.carrier === p.id ? g.players.get(tray.helper) : undefined;
    const cx = px(p.x),
      cy = py(p.y) - TILE * 0.05;
    const w = TILE * 0.9,
      h = TILE * 0.26;
    gfx.fillStyle(hexNum(C.wood2), 1).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h * 0.4);
    gfx.fillStyle(hexNum(C.wood), 1).fillRoundedRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6, h * 0.3);
    const pulse = helper ? 0 : 0.5 + 0.5 * Math.sin(t / 160);
    const end = (x: number, y: number, held: boolean) => {
      gfx.fillStyle(hexNum(held ? C.basil : C.steel2), 1).fillCircle(x, y, TILE * (0.1 + (held ? 0 : 0.04 * pulse)));
      if (!held) gfx.lineStyle(3, hexNum(C.warn), 0.35 + 0.5 * pulse).strokeCircle(x, y, TILE * (0.18 + 0.06 * pulse));
    };
    end(cx - w / 2, cy, true);
    if (helper) {
      const hx = px(helper.x),
        hy = py(helper.y);
      gfx.lineStyle(TILE * 0.08, hexNum(C.basil), 0.9).lineBetween(cx + w / 2, cy, hx, hy);
      end(cx + w / 2, cy, true);
    } else end(cx + w / 2, cy, false);
  }
}

export const heavyTrayArt: MechArt = {
  draw: (scene?: Phaser.Scene, g?: Game, t = 0) => {
    if (!scene || !g) return;
    const gfx = layer(scene);
    gfx.clear();
    drawTrays(gfx, g, t);
  },
};
