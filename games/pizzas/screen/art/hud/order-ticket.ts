// One order ticket of the top strip: its state, how it is built and how it leaves (split from hud.ts, moved verbatim; the scene comes in as an argument).
import type Phaser from 'phaser';
import type { Recipe } from '../../../sim/recipes/defs';
import { C, W, hexNum, R } from '@pichi/screen-kit/art';
import { Bar } from '../stations';
import { recipeParts } from '../food/ticket';
import { birthdayParts, trayParts, type Tray, type TicketMark } from '../food/ticket-tray';
import { makeText } from '@pichi/screen-kit/art/fx';

export interface Ticket {
  id: number;
  team: number;
  vip: boolean;
  bg: Phaser.GameObjects.Image;
  frame: Phaser.GameObjects.Graphics; // the golden border of a VIP order
  root: Phaser.GameObjects.Container;
  bar: Bar;
  tray?: Tray; // a Bandeja: its three plates
  x: number; // current left edge, smoothed
  enter: { v: number };
  leaving: boolean;
}

export function makeTicket(
  scene: Phaser.Scene,
  id: number,
  recipe: Recipe,
  team: number,
  vip: boolean,
  mark: TicketMark,
  parts?: readonly Recipe[],
): Ticket {
  const tray = parts && trayParts(scene, parts);
  const s = scene;
  const bg = s.add
    .image(0, 0, 'ticket_bg')
    .setOrigin(0.5, 0)
    .setScale(1 / R);
  const bar = new Bar(s, 100);
  bar.root.setPosition(0, 17);
  const num = makeText(s, -50, 38, `#${id + 1}`, { size: 11, color: C.muted, stroke: 0, depth: 0 });
  bar.root.setVisible(true);
  const frame = s.add.graphics().setVisible(vip);
  frame.lineStyle(7, hexNum(C.cheese2), 1).strokeRoundedRect(-62, 3, 124, 96, 10);
  frame.lineStyle(3, hexNum(C.cheese), 1).strokeRoundedRect(-62, 3, 124, 96, 10);
  const extra = mark ? birthdayParts(s, frame, mark) : []; // the "Pedido de cumpleaños" (midround.ts): a pink ticket with a pink frame, a balloon and what it pays
  const root = s.add
    .container(W + 200, 6, [bg, frame, bar.root, ...(tray ? tray.objects : recipeParts(s, recipe)), num, ...extra])
    .setDepth(2100 + id * 0.001);
  root.setAngle((id % 3) - 1);
  if (vip) bg.setTint(hexNum(C.cheese));
  else if (mark) bg.setTint(mark === 'red' ? 0xffb199 : 0xffc9e2);
  const t: Ticket = { id, team, vip, bg, frame, root, bar, ...(tray ? { tray } : {}), x: NaN, enter: { v: 0 }, leaving: false };
  s.tweens.add({ targets: t.enter, v: 1, duration: 300, ease: 'back.out' });
  return t;
}

export function leaveTicket(scene: Phaser.Scene, t: Ticket, how: 'deliver' | 'expire') {
  t.leaving = true;
  const r = t.root;
  if (how === 'deliver') {
    scene.tweens.add({ targets: r, y: r.y - 120, alpha: 0, duration: 450, ease: 'cubic.in', onComplete: () => r.destroy() });
  } else {
    r.each((o: Phaser.GameObjects.GameObject) => {
      if ((o as Phaser.GameObjects.Image).setTint && o.type === 'Image') (o as Phaser.GameObjects.Image).setTint(hexNum(C.danger));
    });
    scene.tweens.add({
      targets: r,
      y: r.y + 280,
      angle: r.angle + 35,
      alpha: 0,
      duration: 650,
      ease: 'cubic.in',
      onComplete: () => r.destroy(),
    });
  }
}
