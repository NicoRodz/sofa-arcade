// The rat of HAZARD_V2 that dodges a dash (sim/feel/rat-v2.ts), drawn so that a group that never played reads it: the jump is a hop with a white streak and ghost copies behind it and a
// "¡FIU!"; then it PANTS for `pantMs`: sweat drops fly off its head, it heaves, a target ring closes in on it and "¡AHORA!" blinks over it, which is the window for a second chef.
// Reads the rats of feel/rats.ts (coop: the one; versus: one per kitchen, each with its own sweat, ring and "¡AHORA!") (dodgeMs / dodgeFrom / pantMs); the hop and the heave are applied to the sprite by events/view.ts through `ratLift`.
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import { ratParams } from '../../../sim/feel/rat-v2';
import { C, TILE, hexNum } from '@pichi/screen-kit/art';
import { OX, OY } from '../env/grid';
import { type Fx, makeText } from '@pichi/screen-kit/art/fx';
import { place } from '../stations';
import type { Rat } from '../../../sim/midround';
import { ratOfTeam, ratsOf } from './rats';

/** Pixels the rat sprite rises now: an arc while it jumps aside, a small fast heave while it pants. */
export function ratLift(g: Game, team = 0): number {
  const r = ratOfTeam(g, team);
  if (!r || !g.hz) return 0;
  const jump = ratParams(g).dodgeMs;
  if ((r.dodgeMs ?? 0) > 0 && jump > 0) return Math.sin(Math.PI * (1 - r.dodgeMs! / jump)) * TILE * 0.6;
  return (r.pantMs ?? 0) > 0 ? Math.abs(Math.sin(g.time / 55)) * 6 : 0;
}

/** What one rat keeps between frames: its "¡AHORA!" text, the ghost and sweat timers and the drops in the air. */
interface Lane {
  now: Phaser.GameObjects.Text;
  ghost: number; // ms to the next ghost copy
  sweat: number; // ms to the next sweat drop
  drops: { x: number; y: number; vx: number; vy: number; age: number }[];
}

export class RatDodge {
  readonly g: Phaser.GameObjects.Graphics;
  private under: Phaser.GameObjects.Graphics;
  private lanes = new Map<number, Lane>();
  private t = 0;
  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    this.g = scene.add.graphics().setDepth(2150);
    this.under = scene.add.graphics().setDepth(95); // under the rat sprite (depth 100 + y), so the glow never washes it out
    const off = bus.on('rat:dodge', (e) => {
      const r = ratOfTeam(game, e.team ?? 0);
      if (!r) return;
      const x = OX + r.x * TILE,
        y = OY + r.y * TILE;
      this.fx.float(x, y - TILE * 1.15, '¡FIU!', '#FFFFFF', 120);
      this.fx.ring(x, y + TILE * 0.2, 0xffffff, 0.3, 1.5);
    });
    this.g.once('destroy', () => {
      off();
      for (const l of this.lanes.values()) l.now.destroy();
      this.under.destroy();
    });
  }

  private lane(team: number): Lane {
    let l = this.lanes.get(team);
    if (!l) {
      const now = makeText(this.scene, 0, 0, '¡AHORA!', { size: 92, color: C.cheese, stroke: 14, depth: 2160 }).setVisible(false);
      l = { now, ghost: 0, sweat: 0, drops: [] };
      this.lanes.set(team, l);
    }
    return l;
  }

  update(dtMs: number) {
    this.t += dtMs;
    const { g, game } = this;
    g.clear();
    this.under.clear();
    const live = game.over || !game.hz ? [] : ratsOf(game);
    for (const [team, l] of this.lanes) if (!live.some(([t]) => t === team)) l.now.setVisible(false);
    for (const [team, r] of live) this.draw(this.lane(team), team, r, dtMs);
  }

  private draw(lane: Lane, team: number, r: Rat, dtMs: number) {
    const { g, game } = this;
    if (r.scared) return void lane.now.setVisible(false);
    const x = OX + r.x * TILE,
      y = OY + r.y * TILE + TILE * 0.34;
    if ((r.dodgeMs ?? 0) > 0 && r.dodgeFrom) {
      const fx0 = OX + r.dodgeFrom[0] * TILE,
        fy0 = OY + r.dodgeFrom[1] * TILE + TILE * 0.34;
      for (const [w, a] of [
        [22, 0.35],
        [10, 0.9],
      ] as const)
        g.lineStyle(w, 0xffffff, a).lineBetween(fx0, fy0 - TILE * 0.1, x, y - TILE * 0.1); // the streak from where it was
      lane.ghost -= dtMs;
      if (lane.ghost <= 0) {
        lane.ghost = 28;
        // same origin and scale as the rat sprite (events/view.ts), so a copy sits exactly on the rat's path
        const img = place(this.scene, 'rat', x, y - ratLift(game, team), 0.92)
          .setTint(0xbfe8f5)
          .setAlpha(0.6)
          .setDepth(2149);
        img.setFlipX(x < fx0);
        this.scene.tweens.add({ targets: img, alpha: 0, duration: 240, onComplete: () => img.destroy() });
      }
    }
    const pant = r.pantMs ?? 0;
    if (pant <= 0) return void lane.now.setVisible(false);
    // the window (the whole of pantMs): a yellow ring that closes on a fixed target ring around the rat, "¡AHORA!" big over it, sweat flying off its head
    const total = ratParams(game).pantMs || 600,
      k = Math.max(0, Math.min(1, pant / total)),
      pulse = 0.5 + 0.5 * Math.sin(this.t / 60),
      cy = y - TILE * 0.2 - ratLift(game, team),
      rTarget = TILE * 0.6,
      rRing = rTarget + TILE * 1.1 * k;
    this.under.fillStyle(hexNum(C.cheese), 0.45 + 0.2 * pulse).fillCircle(x, cy, rTarget);
    g.lineStyle(10, 0x2b1b17, 0.85)
      .strokeCircle(x, cy, rTarget + 7)
      .strokeCircle(x, cy, rRing + 9);
    g.lineStyle(9, hexNum(C.cheese), 1).strokeCircle(x, cy, rTarget);
    g.lineStyle(14, hexNum(C.cheese), 0.7 + 0.3 * pulse).strokeCircle(x, cy, rRing);
    lane.now
      .setVisible(true)
      .setPosition(Math.max(260, Math.min(this.scene.scale.width - 260, x)), cy - TILE * 1.25)
      .setScale(1 + 0.12 * pulse)
      .setColor(pulse > 0.5 ? C.cheese : '#FFFFFF');
    lane.sweat -= dtMs;
    if (lane.sweat <= 0) {
      lane.sweat = 55;
      for (const side of [-1, 1])
        lane.drops.push({
          x: x + side * TILE * 0.12,
          y: cy - TILE * 0.25,
          vx: side * TILE * (0.5 + Math.random() * 0.7),
          vy: -TILE * (0.6 + Math.random() * 0.5),
          age: 0,
        });
    }
    // sweat: crisp blue drops thrown up and out, falling back (drawn here, not as soft particles, so they read against the floor)
    for (const d of lane.drops) {
      d.age += dtMs;
      d.x += (d.vx * dtMs) / 1000;
      d.y += (d.vy * dtMs) / 1000;
      d.vy += (TILE * 3.2 * dtMs) / 1000;
      const a = Math.max(0, 1 - d.age / 650);
      g.fillStyle(0x2b1b17, a)
        .fillCircle(d.x, d.y, 11)
        .fillStyle(0x5ec8f5, a)
        .fillCircle(d.x, d.y, 8)
        .fillStyle(0xffffff, a)
        .fillCircle(d.x - 3, d.y - 3, 3);
    }
    lane.drops = lane.drops.filter((d) => d.age < 650);
  }
}
