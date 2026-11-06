// Versus HUD, the scoreboard plate of a team: how it is built and how its streak and golden-order chips are drawn
// (split from versus-hud.ts, moved verbatim; the scene and the team view come in as arguments).
import type Phaser from 'phaser';
import type { TeamInfo } from '@pichi/core/lobby';
import { C, R, hexNum } from '@pichi/screen-kit/art';
import { makeText } from '@pichi/screen-kit/art/fx';
import { VS_PLATE } from './layout';
import { place } from '../stations';

export const D = 2000;
const chipLeft = (x0: number, mirror: boolean) => (mirror ? x0 + VS_PLATE.w - 16 - 128 : x0 + 16); // the streak and golden-order chips sit on the outer side of the plate
export const rrect = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number) =>
  g.fillRoundedRect(x, y, w, h, r);

export interface Plate {
  g: Phaser.GameObjects.Graphics; // the plate itself (static)
  chips: Phaser.GameObjects.Graphics; // streak and golden-order chips (redrawn when they change)
  name: Phaser.GameObjects.Text;
  score: Phaser.GameObjects.Text;
  k: Phaser.GameObjects.Text;
  streak: Phaser.GameObjects.Text;
  flame: Phaser.GameObjects.Image;
  vips: Phaser.GameObjects.Text;
  crown: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Graphics;
  shown: number;
  last: number;
  chipKey: string;
  x0: number;
  mirror: boolean;
}

export function buildPlate(scene: Phaser.Scene, view: { teams: readonly TeamInfo[] | null }, id: number): Plate {
  const s = scene,
    info = view.teams?.[id];
  const { w, h, y, x } = VS_PLATE;
  const x0 = x[id] ?? x[0],
    mirror = id === 1;
  const col = hexNum(info?.color ?? '#888888');
  const g = s.add.graphics().setDepth(D);
  g.fillStyle(0x2b1b17, 0.3);
  rrect(g, x0 - 2, y + 6, w, h, 20);
  g.fillStyle(col, 1);
  rrect(g, x0, y, w, h, 20);
  g.fillStyle(0x000000, 0.18);
  rrect(g, x0, y + h * 0.62, w, h * 0.38, 20);
  g.fillStyle(col, 1);
  g.fillRect(x0 + 4, y + h * 0.62, w - 8, 10);
  g.lineStyle(5, hexNum(C.ink), 1).strokeRoundedRect(x0, y, w, h, 20);
  g.fillStyle(0xffffff, 0.26);
  rrect(g, x0 + 14, y + 5, w - 28, 7, 3);
  // name and chips hug the outer edge, the score and the handicap face the clock: "▲ Picantes 340 | 2:15 | 410 Frescos ●"
  const outer = mirror ? x0 + w - 16 : x0 + 16,
    inner = mirror ? x0 + 16 : x0 + w - 16;
  const oo = mirror ? 1 : 0,
    io = mirror ? 0 : 1;
  const icon = `${info?.icon ?? ''}`;
  const name = makeText(s, outer, y + 25, `${icon} ${info?.name ?? `Equipo ${id + 1}`}`, {
    size: 26,
    color: C.cream,
    stroke: 5,
    depth: D + 2,
  }).setOrigin(oo, 0.5);
  const score = makeText(s, inner, y + 62, '0', { size: 48, color: C.cream, stroke: 7, depth: D + 2 }).setOrigin(io, 0.5);
  const k = makeText(s, inner, y + 25, '', { size: 24, color: C.cheese, stroke: 5, depth: D + 2 }).setOrigin(io, 0.5);
  const chipX = chipLeft(x0, mirror);
  const chips = s.add.graphics().setDepth(D + 1);
  const flame = place(s, 'flame_1', chipX + 14, y + 74, 1)
    .setScale(0.3 / R)
    .setDepth(D + 2)
    .setVisible(false);
  const streak = makeText(s, chipX + 46, y + 61, '', { size: 24, color: C.cream, stroke: 4, depth: D + 2 });
  const vips = makeText(s, chipX + 106, y + 61, '', { size: 24, color: C.cheese, stroke: 4, depth: D + 2 });
  const crown = makeText(s, mirror ? x0 + w + 4 : x0 - 4, y + 14, '👑', { size: 40, depth: D + 4 })
    .setVisible(false)
    .setAngle(mirror ? 16 : -16); // on the outer top corner of the plate
  const glow = s.add
    .graphics()
    .setDepth(D - 1)
    .setVisible(false);
  return { g, chips, name, score, k, streak, flame, vips, crown, glow, shown: 0, last: 0, chipKey: '', x0, mirror };
}

// The streak chip shows the tip multiplier the next delivery earns (dim at x1: nothing running) and the golden orders won are stars.
export function drawChips(scene: Phaser.Scene, p: Plate, streak: number, mult: number, vips: number) {
  const key = `${streak}|${mult}|${vips}`;
  if (key === p.chipKey) return;
  p.chipKey = key;
  const { y, h } = VS_PLATE;
  const chipX = chipLeft(p.x0, p.mirror);
  const g = p.chips;
  g.clear();
  const hot = mult >= 2;
  const col = mult >= 4 ? C.tomato : mult === 3 ? C.fire : C.cheese2;
  g.fillStyle(0x000000, hot ? 0.0 : 0.22);
  rrect(g, chipX, y + h - 36, 64, 28, 14);
  if (hot) {
    g.fillStyle(hexNum(col), 1);
    rrect(g, chipX, y + h - 36, 64, 28, 14);
    g.lineStyle(3, hexNum(C.ink), 1).strokeRoundedRect(chipX, y + h - 36, 64, 28, 14);
  }
  g.fillStyle(0x000000, vips ? 0 : 0.22);
  rrect(g, chipX + 72, y + h - 36, 56, 28, 14);
  if (vips) {
    g.fillStyle(hexNum(C.cheese2), 1);
    rrect(g, chipX + 72, y + h - 36, 56, 28, 14);
    g.lineStyle(3, hexNum(C.ink), 1).strokeRoundedRect(chipX + 72, y + h - 36, 56, 28, 14);
  }
  p.flame.setVisible(hot).setAlpha(1);
  p.streak
    .setText(`x${mult}`)
    .setAlpha(hot ? 1 : 0.55)
    .setColor(C.cream)
    .setX(chipX + (hot ? 40 : 32));
  p.vips
    .setText(vips ? `★${vips}` : '★')
    .setAlpha(vips ? 1 : 0.5)
    .setColor(vips ? C.ink : C.cream)
    .setX(chipX + 100);
  if (hot) scene.tweens.add({ targets: p.streak, scale: { from: 1.4, to: 1 }, duration: 240, ease: 'back.out' });
  if (vips) scene.tweens.add({ targets: p.vips, scale: { from: 1.4, to: 1 }, duration: 240, ease: 'back.out' });
}
