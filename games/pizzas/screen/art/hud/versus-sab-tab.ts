// Versus HUD, sabotage: the tab under each team's plate with the bags waiting at its bin (split from versus-hud.ts, moved verbatim; the scene,
// the game and the team view come in as arguments, and the "bag ready" notice is a callback).
import type Phaser from 'phaser';
import type { TeamInfo } from '@pichi/core/lobby';
import type { Game } from '../../../sim/overcooked';
import { C, R, hexNum } from '@pichi/screen-kit/art';
import { makeText } from '@pichi/screen-kit/art/fx';
import { D, rrect } from './versus-plate';
import { VS_PLATE } from './layout';
import { foodKey } from '../food';
import { place } from '../stations';

// Sabotage: a tab under each team's plate with the bags waiting at its bin (bag icon and number), the desechos towards the next bag (3 pips) and "basura 2/3".
export interface SabTab {
  g: Phaser.GameObjects.Graphics;
  bag: Phaser.GameObjects.Image;
  n: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  x: number;
  key: string;
  last: number;
}
export const SAB_TAB = { w: 244, h: 30, dy: 90 } as const; // hangs from the bottom edge of the plate
export function buildTab(scene: Phaser.Scene, id: number): SabTab {
  const s = scene,
    { w, x } = VS_PLATE;
  const x0 = (x[id] ?? x[0]) + (w - SAB_TAB.w) / 2;
  const g = s.add.graphics().setDepth(D - 1);
  const bag = place(s, foodKey('bag'), x0 + 24, VS_PLATE.y + SAB_TAB.dy + 22, 1)
    .setScale(0.4 / R)
    .setDepth(D + 2);
  const n = makeText(s, x0 + 44, VS_PLATE.y + SAB_TAB.dy + 15, '', { size: 22, color: C.cream, stroke: 4, depth: D + 2 }).setOrigin(0, 0.5);
  const label = makeText(s, x0 + SAB_TAB.w - 12, VS_PLATE.y + SAB_TAB.dy + 16, '', {
    size: 19,
    color: C.cream,
    stroke: 4,
    depth: D + 2,
  }).setOrigin(1, 0.5);
  return { g, bag, n, label, x: x0, key: '', last: 0 };
}

export function drawTab(
  scene: Phaser.Scene,
  game: Game,
  view: { teams: readonly TeamInfo[] | null },
  tab: SabTab,
  i: number,
  onBag: (i: number, info: TeamInfo | undefined) => void,
) {
  const sab = game.sab!,
    st = sab.teams[i]!;
  const info = view.teams?.[i];
  const whole = Math.min(2, Math.floor(st.desechos + 1e-9)),
    part = st.desechos - whole;
  const key = `${st.bags}|${whole}|${Math.round(part * 4)}|${st.aim ? 1 : 0}|${game.time < st.cooldownUntil ? 1 : 0}`;
  if (key === tab.key) return;
  tab.key = key;
  const { w, h, dy } = SAB_TAB,
    y = VS_PLATE.y + dy,
    col = hexNum(info?.color ?? '#888888');
  const g = tab.g;
  g.clear();
  g.fillStyle(0x2b1b17, 0.3);
  rrect(g, tab.x - 2, y + 4, w, h, 12);
  g.fillStyle(col, 1);
  rrect(g, tab.x, y, w, h, 12);
  g.fillStyle(0x000000, 0.22);
  rrect(g, tab.x, y + h * 0.55, w, h * 0.45, 12);
  g.lineStyle(4, hexNum(C.ink), 1).strokeRoundedRect(tab.x, y, w, h, 12);
  for (let k = 0; k < 3; k++) {
    // the three pips towards the next bag
    const px = tab.x + 86 + k * 24;
    g.fillStyle(0x000000, 0.35);
    rrect(g, px, y + 9, 20, 12, 4);
    const fill = k < whole ? 1 : k === whole ? part : 0;
    if (fill > 0.01) {
      g.fillStyle(hexNum(C.cheese), 1);
      rrect(g, px, y + 9, Math.max(6, 20 * fill), 12, 4);
    }
    g.lineStyle(2, hexNum(C.ink), 0.9).strokeRoundedRect(px, y + 9, 20, 12, 4);
  }
  tab.n.setText(`×${st.bags}`).setAlpha(st.bags > 0 ? 1 : 0.55);
  tab.bag.setAlpha(st.bags > 0 ? 1 : 0.45);
  tab.label.setText(`basura ${whole}/3`);
  if (st.bags > tab.last) {
    const k = tab.bag.scaleX;
    scene.tweens.add({
      targets: tab.bag,
      scaleX: { from: k * 1.7, to: k },
      scaleY: { from: k * 1.7, to: k },
      duration: 320,
      ease: 'back.out',
    });
    scene.tweens.add({ targets: tab.n, scale: { from: 1.7, to: 1 }, duration: 320, ease: 'back.out' });
    onBag(i, info);
  }
  tab.last = st.bags;
}
